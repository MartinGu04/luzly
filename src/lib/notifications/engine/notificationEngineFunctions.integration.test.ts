import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * A GENUINE runtime proof of the three PL/pgSQL functions PR #30's
 * notification engine relies on for concurrency safety
 * (`advance_notification_baseline`, `claim_due_pending_notification_changes`,
 * `claim_due_notification_jobs`) -- mirrors
 * `src/lib/push/upsertPushSubscriptionRpc.integration.test.ts`'s exact
 * approach (real throwaway Postgres database, real migration files
 * loaded byte-for-byte, a minimal stand-in `auth` schema) rather than
 * mocking the database, because the property under test IS the
 * database's own row-locking behavior (`for update`, `for update skip
 * locked`) -- something a mock cannot honestly prove.
 *
 * Self-skips when no Postgres is reachable, exactly like the sibling
 * suite -- see its own docstring for why this is intentionally NOT part
 * of every contributor's required `npm test` gate.
 */
const BASE_CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const CONNECTION_TIMEOUT_MS = 1500;

function withDatabase(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function probeDatabaseAvailable(): Promise<boolean> {
  const probe = new Client({ connectionString: BASE_CONNECTION_STRING, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
  try {
    await probe.connect();
    await probe.end();
    return true;
  } catch {
    return false;
  }
}

const databaseAvailable = await probeDatabaseAvailable();

if (!databaseAvailable) {
  console.warn(
    "[notificationEngineFunctions.integration.test] No reachable Postgres at " +
      `${BASE_CONNECTION_STRING} -- skipping. Set TEST_DATABASE_URL to run it.`,
  );
}

describe.skipIf(!databaseAvailable)("notification engine SQL functions -- real PostgreSQL execution", () => {
  const dbName = `test_notif_engine_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let admin: Client;
  let db: Client;

  const USER_A = "00000000-0000-0000-0000-0000000000a1";

  beforeAll(async () => {
    admin = new Client({ connectionString: BASE_CONNECTION_STRING });
    await admin.connect();
    await admin.query(`create database ${dbName}`);

    db = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
    await db.connect();

    await db.query(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid
        language sql stable
        as $$
          select (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
        $$;
    `);

    await db.query(`
      do $$
      begin
        if not exists (select from pg_roles where rolname = 'authenticated') then
          create role authenticated;
        end if;
        if not exists (select from pg_roles where rolname = 'anon') then
          create role anon;
        end if;
        if not exists (select from pg_roles where rolname = 'service_role') then
          create role service_role;
        end if;
      end
      $$;
    `);

    const migrationsDir = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");
    const migrationFiles = fs.readdirSync(migrationsDir).sort();
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await db.query(sql);
    }

    await db.query("insert into auth.users (id) values ($1)", [USER_A]);
  }, 30_000);

  afterAll(async () => {
    if (db) await db.end();
    if (admin) {
      await admin.query(`drop database if exists ${dbName}`).catch(() => {});
      await admin.end();
    }
  }, 30_000);

  // -------------------------------------------------------------------
  // advance_notification_baseline
  // -------------------------------------------------------------------

  describe("advance_notification_baseline", () => {
    it("1. first call ever initializes silently", async () => {
      const result = await db.query("select * from public.advance_notification_baseline($1)", ["2026-08-16"]);
      expect(result.rows[0].action).toBe("initialized");
      expect(result.rows[0].previous_week_start).toBeNull();
    });

    it("2. a second call with the SAME week is unchanged", async () => {
      const result = await db.query("select * from public.advance_notification_baseline($1)", ["2026-08-16"]);
      expect(result.rows[0].action).toBe("unchanged");
    });

    it("3. a call with a DIFFERENT week rolls over and reports the previous week", async () => {
      const result = await db.query("select * from public.advance_notification_baseline($1)", ["2026-08-23"]);
      expect(result.rows[0].action).toBe("rolled_over");
      const previousWeekStart = result.rows[0].previous_week_start as Date;
      expect(previousWeekStart.toISOString()).toMatch(/2026-08-16/);
    });

    it("4. two concurrent callers for the same new week: only one observes the transition, the other sees 'unchanged'", async () => {
      const connA = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
      const connB = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
      await connA.connect();
      await connB.connect();

      try {
        await connA.query("begin");
        const lockedResult = connA.query("select * from public.advance_notification_baseline($1)", ["2026-08-30"]);

        // Give A a moment to acquire the row lock before B races in.
        await new Promise((resolve) => setTimeout(resolve, 150));

        const bPromise = connB.query("select * from public.advance_notification_baseline($1)", ["2026-08-30"]);

        // B must still be blocked on A's row lock -- prove it hasn't
        // resolved yet before A commits.
        let bResolved = false;
        bPromise.then(() => {
          bResolved = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(bResolved).toBe(false);

        await connA.query("commit");
        const aResult = await lockedResult;
        const bResult = await bPromise;

        const actions = [aResult.rows[0].action, bResult.rows[0].action].sort();
        // Exactly one of the two concurrent callers observes the real
        // transition; the other, unblocked only after A committed, sees
        // the already-updated row and reports 'unchanged'.
        expect(actions).toEqual(["rolled_over", "unchanged"]);
      } finally {
        await connA.end();
        await connB.end();
      }
    });

    it("5. anon/authenticated cannot execute the function at all", async () => {
      await db.query("set role authenticated");
      try {
        await expect(
          db.query("select * from public.advance_notification_baseline($1)", ["2026-09-06"]),
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await db.query("reset role");
      }
    });
  });

  // -------------------------------------------------------------------
  // claim_due_pending_notification_changes
  // -------------------------------------------------------------------

  describe("claim_due_pending_notification_changes", () => {
    async function insertPendingChange(factKey: string, settleAtOffsetMs: number, status = "pending") {
      await db.query(
        `insert into public.pending_notification_changes
           (week_start_date, fact_key, category, original_value, latest_value, settle_at, status, claimed_at)
         values ($1, $2, 'shift', '{"a":1}'::jsonb, '{"a":2}'::jsonb, now() + ($3 || ' milliseconds')::interval, $4,
           case when $4 = 'claimed' then now() - interval '20 minutes' else null end)`,
        ["2026-08-16", factKey, settleAtOffsetMs, status],
      );
    }

    it("6. only changes whose settle_at has passed are claimed, and their status flips to claimed", async () => {
      await insertPendingChange("shift:p_due:2026-08-18", -1000);
      await insertPendingChange("shift:p_not_due:2026-08-18", 60_000);

      const result = await db.query("select * from public.claim_due_pending_notification_changes(100)");
      const claimedKeys = result.rows.map((row) => row.fact_key);

      expect(claimedKeys).toContain("shift:p_due:2026-08-18");
      expect(claimedKeys).not.toContain("shift:p_not_due:2026-08-18");

      const statusCheck = await db.query(
        "select status from public.pending_notification_changes where fact_key = $1",
        ["shift:p_due:2026-08-18"],
      );
      expect(statusCheck.rows[0].status).toBe("claimed");
    });

    it("7. a row stuck in 'claimed' past the reclaim window is returned to pending and re-claimed", async () => {
      await insertPendingChange("shift:p_stuck:2026-08-18", -5000, "claimed");

      const result = await db.query("select * from public.claim_due_pending_notification_changes(100)");
      const claimedKeys = result.rows.map((row) => row.fact_key);
      expect(claimedKeys).toContain("shift:p_stuck:2026-08-18");
    });

    it("8. two concurrent claimers never both claim the same due row (SKIP LOCKED)", async () => {
      await insertPendingChange("shift:p_race:2026-08-18", -1000);

      const connA = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
      const connB = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
      await connA.connect();
      await connB.connect();

      try {
        const [resultA, resultB] = await Promise.all([
          connA.query("select * from public.claim_due_pending_notification_changes(100)"),
          connB.query("select * from public.claim_due_pending_notification_changes(100)"),
        ]);

        const allClaimedKeys = [...resultA.rows, ...resultB.rows].map((row) => row.fact_key);
        const raceKeyOccurrences = allClaimedKeys.filter((key) => key === "shift:p_race:2026-08-18").length;
        expect(raceKeyOccurrences).toBe(1);
      } finally {
        await connA.end();
        await connB.end();
      }
    });
  });

  // -------------------------------------------------------------------
  // claim_due_notification_jobs
  // -------------------------------------------------------------------

  describe("claim_due_notification_jobs", () => {
    async function insertJob(dedupeKey: string, scheduledForOffsetMs: number, status = "pending", attempts = 0) {
      await db.query(
        `insert into public.notification_jobs
           (category, recipient_user_id, title, body, path, dedupe_key, scheduled_for, status, attempts, claimed_at)
         values ('shift_change', $1, 't', 'b', '/schedule', $2, now() + ($3 || ' milliseconds')::interval, $4, $5,
           case when $4 = 'claimed' then now() - interval '10 minutes' else null end)`,
        [USER_A, dedupeKey, scheduledForOffsetMs, status, attempts],
      );
    }

    it("9. only due, non-exhausted jobs are claimed, and attempts increments on claim", async () => {
      await insertJob("job-due", -1000);
      await insertJob("job-future", 60_000);
      await insertJob("job-exhausted", -1000);
      await db.query("update public.notification_jobs set attempts = max_attempts where dedupe_key = $1", [
        "job-exhausted",
      ]);

      const result = await db.query("select * from public.claim_due_notification_jobs(100)");
      const claimedKeys = result.rows.map((row) => row.dedupe_key);

      expect(claimedKeys).toContain("job-due");
      expect(claimedKeys).not.toContain("job-future");
      expect(claimedKeys).not.toContain("job-exhausted");

      const claimedRow = result.rows.find((row) => row.dedupe_key === "job-due");
      expect(claimedRow.attempts).toBe(1);
      expect(claimedRow.status).toBe("claimed");
    });

    it("10. a job stuck in 'claimed' past the reclaim window is retried", async () => {
      await insertJob("job-stuck", -1000, "claimed", 1);

      const result = await db.query("select * from public.claim_due_notification_jobs(100)");
      const claimedKeys = result.rows.map((row) => row.dedupe_key);
      expect(claimedKeys).toContain("job-stuck");
    });

    it("11. the dedupe_key unique constraint rejects a duplicate insert -- idempotent job creation", async () => {
      await insertJob("job-unique", 60_000);
      await expect(insertJob("job-unique", 60_000)).rejects.toThrow(/duplicate key/i);
    });
  });
});
