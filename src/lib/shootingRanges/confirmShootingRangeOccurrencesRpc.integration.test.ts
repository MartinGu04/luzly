import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * A GENUINE runtime proof that `confirm_shooting_range_occurrences`
 * (`supabase/migrations/20260825130000_add_confirm_shooting_range_occurrences_rpc.sql`)
 * eliminates the manager-bulk-confirmation TOCTOU race at the database
 * boundary itself -- not merely via an application-side pre-check. Same
 * "real local Postgres, throwaway database, loads the ACTUAL migration
 * files byte-for-byte, self-skips when no database is reachable"
 * convention as `lib/push/upsertPushSubscriptionRpc.integration.test.ts`
 * and `lib/notifications/engine/notificationEngineFunctions.integration.test.ts`
 * -- see either of those for the full rationale; not repeated here.
 *
 * Point `TEST_DATABASE_URL` at any reachable Postgres (a role with
 * CREATEDB) to run this suite; it defaults to a local-dev convenience
 * connection string, never assumed to exist anywhere else.
 */
const BASE_CONNECTION_STRING = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
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
    "[confirmShootingRangeOccurrencesRpc.integration.test] No reachable Postgres at " +
      `${BASE_CONNECTION_STRING} -- skipping the real-database RPC integration suite. ` +
      "Set TEST_DATABASE_URL to run it.",
  );
}

describe.skipIf(!databaseAvailable)("confirm_shooting_range_occurrences -- real PostgreSQL execution", () => {
  const dbName = `test_shooting_ranges_rpc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let admin: Client;
  let db: Client;

  interface ConfirmRow {
    person_id: string;
    resolved_status: "confirmed" | "not_completed";
  }

  async function confirm(
    client: Client,
    rangeDate: string,
    confirmedPersonIds: string[],
    resolverId = "mgr1",
    resolverName = "מנהל בדיקה",
  ): Promise<ConfirmRow[]> {
    const result = await client.query(
      "select * from public.confirm_shooting_range_occurrences($1, $2, $3, $4)",
      [rangeDate, confirmedPersonIds, resolverId, resolverName],
    );
    return result.rows as ConfirmRow[];
  }

  async function seedPlanned(rangeDate: string, personIds: string[]): Promise<void> {
    for (const personId of personIds) {
      await db.query(
        `insert into public.shooting_range_planned_occurrences (range_date, person_id, status, created_by_person_id, created_by_person_name)
         values ($1, $2, 'planned', 'mgr0', 'יוצר בדיקה')`,
        [rangeDate, personId],
      );
    }
  }

  async function completionCount(rangeDate: string, personId: string): Promise<number> {
    const result = await db.query(
      "select count(*)::int as n from public.shooting_range_completions where performed_on = $1 and person_id = $2 and source = 'planned_range_confirmation'",
      [rangeDate, personId],
    );
    return result.rows[0].n;
  }

  async function occurrenceStatus(rangeDate: string, personId: string): Promise<string> {
    const result = await db.query(
      "select status from public.shooting_range_planned_occurrences where range_date = $1 and person_id = $2",
      [rangeDate, personId],
    );
    return result.rows[0].status;
  }

  beforeAll(async () => {
    admin = new Client({ connectionString: BASE_CONNECTION_STRING });
    await admin.connect();
    await admin.query(`create database ${dbName}`);

    db = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
    await db.connect();

    // The migrations' grants/revokes target Supabase's built-in
    // `service_role`/`authenticated`/`anon` roles -- create bare
    // stand-ins so `grant ... to service_role` / `revoke ... from
    // public, anon, authenticated` resolve on a vanilla Postgres.
    // Cluster-wide, so a leftover from a previous run is expected/harmless.
    await db.query(`
      do $$
      begin
        if not exists (select from pg_roles where rolname = 'service_role') then
          create role service_role;
        end if;
        if not exists (select from pg_roles where rolname = 'authenticated') then
          create role authenticated;
        end if;
        if not exists (select from pg_roles where rolname = 'anon') then
          create role anon;
        end if;
      end
      $$;
    `);

    const migrationsDir = path.join(__dirname, "..", "..", "..", "supabase", "migrations");
    const migrationFiles = [
      fs.readdirSync(migrationsDir).find((name) => name.includes("create_shooting_range_completions")),
      fs.readdirSync(migrationsDir).find((name) => name.includes("create_shooting_range_planned_occurrences")),
      fs.readdirSync(migrationsDir).find((name) => name.includes("add_confirm_shooting_range_occurrences_rpc")),
    ];
    for (const file of migrationFiles) {
      if (!file) throw new Error("A required shooting-ranges migration file was not found");
      await db.query(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
    }
  }, 30_000);

  afterAll(async () => {
    if (db) await db.end();
    if (admin) {
      await admin.query(`drop database if exists ${dbName}`).catch(() => {});
      await admin.end();
    }
  }, 30_000);

  it("1. confirms the selected people and marks everyone else still-planned as not_completed, each with a matching completion row", async () => {
    await seedPlanned("2026-09-01", ["p1", "p2", "p3"]);

    const rows = await confirm(db, "2026-09-01", ["p1", "p2"]);

    expect(rows.filter((r) => r.resolved_status === "confirmed").map((r) => r.person_id).sort()).toEqual(["p1", "p2"]);
    expect(rows.filter((r) => r.resolved_status === "not_completed").map((r) => r.person_id)).toEqual(["p3"]);

    expect(await occurrenceStatus("2026-09-01", "p1")).toBe("confirmed");
    expect(await occurrenceStatus("2026-09-01", "p3")).toBe("not_completed");
    expect(await completionCount("2026-09-01", "p1")).toBe(1);
    expect(await completionCount("2026-09-01", "p3")).toBe(1);

    const completion = await db.query(
      "select status from public.shooting_range_completions where performed_on = $1 and person_id = $2",
      ["2026-09-01", "p1"],
    );
    expect(completion.rows[0].status).toBe("approved");
    const rejected = await db.query(
      "select status from public.shooting_range_completions where performed_on = $1 and person_id = $2",
      ["2026-09-01", "p3"],
    );
    expect(rejected.rows[0].status).toBe("rejected");
  });

  it("2. a foreign/stale person id that was never actually planned for this date is silently ignored -- never fabricates a completion", async () => {
    await seedPlanned("2026-09-02", ["p1"]);

    const rows = await confirm(db, "2026-09-02", ["p1", "someone-not-scheduled"]);

    expect(rows.map((r) => r.person_id)).toEqual(["p1"]);
    expect(await completionCount("2026-09-02", "someone-not-scheduled")).toBe(0);
  });

  it("3. a full replay after everything is already resolved is a safe no-op -- zero additional completions, zero returned rows", async () => {
    await seedPlanned("2026-09-04", ["p1"]);
    await confirm(db, "2026-09-04", ["p1"]);

    const replay = await confirm(db, "2026-09-04", ["p1"]);

    expect(replay).toEqual([]);
    expect(await completionCount("2026-09-04", "p1")).toBe(1);
  });

  it("4. TWO CONCURRENT confirmations of the SAME occurrence, from two separate connections, produce exactly ONE approved completion -- the race this RPC exists to close", async () => {
    await seedPlanned("2026-09-05", ["p1"]);

    const connA = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
    const connB = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
    await connA.connect();
    await connB.connect();

    try {
      const [resultA, resultB] = await Promise.all([
        confirm(connA, "2026-09-05", ["p1"], "mgr-a", "מנהל א"),
        confirm(connB, "2026-09-05", ["p1"], "mgr-b", "מנהל ב"),
      ]);

      // Exactly one of the two calls actually won the race (returned the
      // row); the other affected zero rows -- never both, and never
      // neither.
      const totalWinners = resultA.length + resultB.length;
      expect(totalWinners).toBe(1);

      expect(await completionCount("2026-09-05", "p1")).toBe(1);
      expect(await occurrenceStatus("2026-09-05", "p1")).toBe("confirmed");
    } finally {
      await connA.end();
      await connB.end();
    }
  });

  it("5. TWO CONCURRENT confirmations racing over a MIXED confirm/reject outcome still produce exactly one completion per person", async () => {
    await seedPlanned("2026-09-06", ["p1", "p2"]);

    const connA = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
    const connB = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
    await connA.connect();
    await connB.connect();

    try {
      await Promise.all([
        confirm(connA, "2026-09-06", ["p1"], "mgr-a", "מנהל א"),
        confirm(connB, "2026-09-06", ["p1"], "mgr-b", "מנהל ב"),
      ]);

      expect(await completionCount("2026-09-06", "p1")).toBe(1);
      expect(await completionCount("2026-09-06", "p2")).toBe(1);
      expect(await occurrenceStatus("2026-09-06", "p1")).toBe("confirmed");
      expect(await occurrenceStatus("2026-09-06", "p2")).toBe("not_completed");
    } finally {
      await connA.end();
      await connB.end();
    }
  });
});
