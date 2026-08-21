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

  // -------------------------------------------------------------------
  // upsert_pending_reminder_job -- hotfix regression coverage. A GENUINE
  // proof that Postgres's own `ON CONFLICT ... DO UPDATE ... WHERE` guard
  // (not a PostgREST client-side filter, which does NOT apply to an
  // upsert's conflict action) is what actually protects a terminal job
  // from revival -- exactly the property a mock cannot honestly prove,
  // and exactly the assumption the pre-fix code got wrong in Production.
  // -------------------------------------------------------------------

  describe("upsert_pending_reminder_job", () => {
    async function callUpsert(dedupeKey: string, overrides: Partial<{ title: string; scheduledForOffsetMs: number }> = {}) {
      return db.query(
        `select public.upsert_pending_reminder_job($1, $2, $3, 'b', '/', null, $4, now() + ($5 || ' milliseconds')::interval, null)`,
        ["tomorrow_shift", USER_A, overrides.title ?? "t", dedupeKey, overrides.scheduledForOffsetMs ?? 3_600_000],
      );
    }

    async function jobRow(dedupeKey: string) {
      const result = await db.query("select * from public.notification_jobs where dedupe_key = $1", [dedupeKey]);
      return result.rows[0];
    }

    it("12. first call creates a new pending job", async () => {
      await callUpsert("reminder-fresh");
      const row = await jobRow("reminder-fresh");
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(0);
    });

    it("13. a SECOND call while still pending legitimately refreshes content (e.g. the underlying assignment changed)", async () => {
      await callUpsert("reminder-refresh", { title: "original" });
      await callUpsert("reminder-refresh", { title: "updated" });

      const row = await jobRow("reminder-refresh");
      expect(row.status).toBe("pending");
      expect(row.title).toBe("updated");
    });

    it("14. reproduces the real Production incident: once a job reaches 'completed', a LATER reminder tick's upsert must NOT revive it", async () => {
      await callUpsert("reminder-completed", { scheduledForOffsetMs: -1000 });

      // Simulate delivery reaching a genuine terminal state, exactly like
      // delivery.ts's processJob does after every device succeeds.
      await db.query("update public.notification_jobs set status = 'completed', attempts = 1 where dedupe_key = $1", [
        "reminder-completed",
      ]);

      // A later tick recomputes the SAME still-in-range reminder and
      // upserts it again, exactly as runTomorrowShiftReminders does on
      // every tick regardless of the job's current delivery state.
      await callUpsert("reminder-completed", { title: "revived?" });

      const row = await jobRow("reminder-completed");
      expect(row.status).toBe("completed");
      expect(row.attempts).toBe(1);
      // Content is untouched too -- a no-op WHERE-guard miss must not
      // partially apply the update.
      expect(row.title).not.toBe("revived?");
    });

    it("15. 'failed' is not revived either", async () => {
      await callUpsert("reminder-failed");
      await db.query("update public.notification_jobs set status = 'failed', attempts = 5 where dedupe_key = $1", [
        "reminder-failed",
      ]);
      await callUpsert("reminder-failed");

      const row = await jobRow("reminder-failed");
      expect(row.status).toBe("failed");
    });

    it("16. 'skipped' (recipient had zero active push subscriptions) is not revived either", async () => {
      await callUpsert("reminder-skipped");
      await db.query("update public.notification_jobs set status = 'skipped', attempts = 1 where dedupe_key = $1", [
        "reminder-skipped",
      ]);
      await callUpsert("reminder-skipped");

      const row = await jobRow("reminder-skipped");
      expect(row.status).toBe("skipped");
    });

    it("17. 'cancelled' is not revived either", async () => {
      await callUpsert("reminder-cancelled");
      await db.query("update public.notification_jobs set status = 'cancelled' where dedupe_key = $1", [
        "reminder-cancelled",
      ]);
      await callUpsert("reminder-cancelled");

      const row = await jobRow("reminder-cancelled");
      expect(row.status).toBe("cancelled");
    });

    it("18. end-to-end: a completed job stays permanently unclaimable by claim_due_notification_jobs even after a later upsert", async () => {
      await callUpsert("reminder-e2e", { scheduledForOffsetMs: -1000 });
      const claimed = await db.query("select * from public.claim_due_notification_jobs(100)");
      expect(claimed.rows.map((r) => r.dedupe_key)).toContain("reminder-e2e");

      await db.query("update public.notification_jobs set status = 'completed' where dedupe_key = $1", ["reminder-e2e"]);
      await callUpsert("reminder-e2e"); // the next tick's reminder recomputation

      const row = await jobRow("reminder-e2e");
      expect(row.status).toBe("completed");

      const reclaimed = await db.query("select * from public.claim_due_notification_jobs(100)");
      expect(reclaimed.rows.map((r) => r.dedupe_key)).not.toContain("reminder-e2e");
    });

    it("19. anon/authenticated cannot execute the function at all", async () => {
      await db.query("set role authenticated");
      try {
        await expect(callUpsert("reminder-forbidden")).rejects.toThrow(/permission denied/i);
      } finally {
        await db.query("reset role");
      }
    });
  });

  // -------------------------------------------------------------------
  // claim_due_manager_scheduled_broadcasts / claim_manager_scheduled_broadcast_now
  // -- a GENUINE proof of the scheduled-broadcast feature's own
  // concurrency-safety functions (worker-tick bulk claim + "שלח עכשיו"'s
  // single-row claim), same rationale as `claim_due_notification_jobs`
  // above: the property under test IS Postgres's own row-locking/guarded-
  // update behavior, which a mock cannot honestly prove.
  // -------------------------------------------------------------------

  describe("claim_due_manager_scheduled_broadcasts", () => {
    async function insertScheduled(
      id: string,
      overrides: Partial<{ status: string; scheduledForOffsetMs: number; claimedAtOffsetMs: number | null; batchId: string | null }> = {},
    ) {
      const status = overrides.status ?? "scheduled";
      const scheduledForOffsetMs = overrides.scheduledForOffsetMs ?? -1000;
      const claimedAtOffsetMs = overrides.claimedAtOffsetMs ?? null;
      const batchId = overrides.batchId ?? null;
      await db.query(
        `insert into public.manager_scheduled_broadcasts
           (id, status, audience_kind, target_person_ids, title, body, scheduled_for,
            created_by_person_id, created_by_person_name, claimed_at, batch_id)
         values ($1, $2, 'person', '{p_1}', 't', 'b', now() + ($3 || ' milliseconds')::interval,
           'p_manager', 'מנהל',
           case when $4::bigint is null then null else now() + ($4 || ' milliseconds')::interval end,
           $5)`,
        [id, status, scheduledForOffsetMs, claimedAtOffsetMs, batchId],
      );
    }

    async function insertBatch(id: string) {
      await db.query(
        `insert into public.manager_notification_batches
           (id, idempotency_key, created_by_person_id, created_by_person_name, audience_kind, title, body)
         values ($1, $2, 'p_manager', 'מנהל', 'person', 't', 'b')`,
        [id, `scheduled:${id}`],
      );
    }

    it("20. only a due, still-'scheduled' broadcast is claimed -- a future one is left alone", async () => {
      await insertScheduled("aaaaaaaa-0000-0000-0000-000000000001", { scheduledForOffsetMs: -1000 });
      await insertScheduled("aaaaaaaa-0000-0000-0000-000000000002", { scheduledForOffsetMs: 60_000 });

      const result = await db.query("select * from public.claim_due_manager_scheduled_broadcasts(100)");
      const claimedIds = result.rows.map((row) => row.id);

      expect(claimedIds).toContain("aaaaaaaa-0000-0000-0000-000000000001");
      expect(claimedIds).not.toContain("aaaaaaaa-0000-0000-0000-000000000002");
      expect(result.rows.find((row) => row.id === "aaaaaaaa-0000-0000-0000-000000000001").status).toBe("claimed");
    });

    it("21. a second claim call never re-claims an already-'claimed' row -- the exclusivity a worker tick relies on", async () => {
      await insertScheduled("aaaaaaaa-0000-0000-0000-000000000003", { scheduledForOffsetMs: -1000 });

      const first = await db.query("select * from public.claim_due_manager_scheduled_broadcasts(100)");
      expect(first.rows.map((r) => r.id)).toContain("aaaaaaaa-0000-0000-0000-000000000003");

      const second = await db.query("select * from public.claim_due_manager_scheduled_broadcasts(100)");
      expect(second.rows.map((r) => r.id)).not.toContain("aaaaaaaa-0000-0000-0000-000000000003");
    });

    it("22. a 'claimed' row with NO batch_id, stuck past the crash-recovery window, is reset to 'scheduled' and immediately re-claimable", async () => {
      await insertScheduled("aaaaaaaa-0000-0000-0000-000000000004", {
        status: "claimed",
        scheduledForOffsetMs: -1000,
        claimedAtOffsetMs: -10 * 60_000,
        batchId: null,
      });

      const result = await db.query("select * from public.claim_due_manager_scheduled_broadcasts(100)");
      const row = result.rows.find((r) => r.id === "aaaaaaaa-0000-0000-0000-000000000004");
      expect(row).toBeDefined();
      expect(row.status).toBe("claimed");
    });

    it("23. a 'claimed' row that already HAS a batch_id is always resumable, even if its claim is fresh (not stale) -- a checkpointed dispatch is never left stranded", async () => {
      await insertBatch("bbbbbbbb-0000-0000-0000-000000000001");
      await insertScheduled("aaaaaaaa-0000-0000-0000-000000000005", {
        status: "claimed",
        scheduledForOffsetMs: -1000,
        claimedAtOffsetMs: 0, // just claimed -- NOT past the stale-reclaim window
        batchId: "bbbbbbbb-0000-0000-0000-000000000001",
      });

      const result = await db.query("select * from public.claim_due_manager_scheduled_broadcasts(100)");
      expect(result.rows.map((r) => r.id)).toContain("aaaaaaaa-0000-0000-0000-000000000005");
    });

    it("24. a 'claimed' row with NO batch_id that is still within the crash-recovery window is NOT reclaimed -- a normal in-flight dispatch is left alone", async () => {
      await insertScheduled("aaaaaaaa-0000-0000-0000-000000000006", {
        status: "claimed",
        scheduledForOffsetMs: -1000,
        claimedAtOffsetMs: -30_000, // 30s ago -- well within the 4-minute window
        batchId: null,
      });

      const result = await db.query("select * from public.claim_due_manager_scheduled_broadcasts(100)");
      expect(result.rows.map((r) => r.id)).not.toContain("aaaaaaaa-0000-0000-0000-000000000006");
    });

    it("25. anon/authenticated cannot execute the function at all", async () => {
      await db.query("set role authenticated");
      try {
        await expect(db.query("select * from public.claim_due_manager_scheduled_broadcasts(100)")).rejects.toThrow(
          /permission denied/i,
        );
      } finally {
        await db.query("reset role");
      }
    });
  });

  describe("claim_manager_scheduled_broadcast_now", () => {
    async function insertScheduled(id: string, status: string, scheduledForOffsetMs: number) {
      await db.query(
        `insert into public.manager_scheduled_broadcasts
           (id, status, audience_kind, target_person_ids, title, body, scheduled_for, created_by_person_id, created_by_person_name)
         values ($1, $2, 'person', '{p_1}', 't', 'b', now() + ($3 || ' milliseconds')::interval, 'p_manager', 'מנהל')`,
        [id, status, scheduledForOffsetMs],
      );
    }

    async function claimNow(id: string, personId = "p_manager_b", personName = "רותם מנהלת") {
      return db.query("select * from public.claim_manager_scheduled_broadcast_now($1, $2, $3)", [id, personId, personName]);
    }

    it("26. claims a still-'scheduled' broadcast regardless of how far in the future scheduled_for is", async () => {
      await insertScheduled("cccccccc-0000-0000-0000-000000000001", "scheduled", 3_600_000);

      const result = await claimNow("cccccccc-0000-0000-0000-000000000001");

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe("claimed");
    });

    it("27. returns nothing for a broadcast that is already claimed, dispatched, or cancelled -- the truthful 'already started' signal", async () => {
      await insertScheduled("cccccccc-0000-0000-0000-000000000002", "claimed", -1000);
      await insertScheduled("cccccccc-0000-0000-0000-000000000003", "dispatched", -1000);
      await insertScheduled("cccccccc-0000-0000-0000-000000000004", "cancelled", -1000);

      for (const id of [
        "cccccccc-0000-0000-0000-000000000002",
        "cccccccc-0000-0000-0000-000000000003",
        "cccccccc-0000-0000-0000-000000000004",
      ]) {
        const result = await claimNow(id);
        expect(result.rows).toHaveLength(0);
      }
    });

    it("28. a second 'שלח עכשיו' claim on the same broadcast never succeeds twice -- exactly one logical dispatch", async () => {
      await insertScheduled("cccccccc-0000-0000-0000-000000000005", "scheduled", -1000);

      const first = await claimNow("cccccccc-0000-0000-0000-000000000005");
      const second = await claimNow("cccccccc-0000-0000-0000-000000000005");

      expect(first.rows).toHaveLength(1);
      expect(second.rows).toHaveLength(0);
    });

    it("29. anon/authenticated cannot execute the function at all", async () => {
      await insertScheduled("cccccccc-0000-0000-0000-000000000006", "scheduled", -1000);
      await db.query("set role authenticated");
      try {
        await expect(claimNow("cccccccc-0000-0000-0000-000000000006")).rejects.toThrow(/permission denied/i);
      } finally {
        await db.query("reset role");
      }
    });

    it("30. records the ACTING manager's identity atomically with the winning claim -- never the original scheduler, never a losing racer", async () => {
      await insertScheduled("cccccccc-0000-0000-0000-000000000007", "scheduled", -1000);

      const winner = await claimNow("cccccccc-0000-0000-0000-000000000007", "p_manager_b", "רותם מנהלת");
      expect(winner.rows).toHaveLength(1);
      expect(winner.rows[0].created_by_person_id).toBe("p_manager"); // original scheduler, untouched
      expect(winner.rows[0].sent_now_by_person_id).toBe("p_manager_b");
      expect(winner.rows[0].sent_now_by_person_name).toBe("רותם מנהלת");
      expect(winner.rows[0].sent_now_at).not.toBeNull();

      // A second (losing) claim attempt by a DIFFERENT manager must never overwrite the winner's identity.
      const loser = await claimNow("cccccccc-0000-0000-0000-000000000007", "p_manager_c", "מנהל אחר");
      expect(loser.rows).toHaveLength(0);
      const row = await db.query("select * from public.manager_scheduled_broadcasts where id = $1", [
        "cccccccc-0000-0000-0000-000000000007",
      ]);
      expect(row.rows[0].sent_now_by_person_id).toBe("p_manager_b");
    });

    it("31. a normal due-time worker claim (claim_due_manager_scheduled_broadcasts) never sets sent_now_by_* -- only an explicit 'שלח עכשיו' claim does", async () => {
      await insertScheduled("cccccccc-0000-0000-0000-000000000008", "scheduled", -1000);

      const result = await db.query("select * from public.claim_due_manager_scheduled_broadcasts(100)");
      const row = result.rows.find((r) => r.id === "cccccccc-0000-0000-0000-000000000008");
      expect(row).toBeDefined();
      expect(row.sent_now_by_person_id).toBeNull();
    });
  });
});
