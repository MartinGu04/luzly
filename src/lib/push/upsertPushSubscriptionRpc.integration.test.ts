import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * A GENUINE runtime proof of `upsert_push_subscription`'s security
 * behavior (PR #29 review) -- unlike `migration.test.ts` (which only
 * pattern-matches the SQL text and says so explicitly), this file
 * connects to a real local PostgreSQL, creates a throwaway database,
 * loads the ACTUAL migration file byte-for-byte, stubs just enough of
 * Supabase's `auth` schema (`auth.users`, `auth.uid()` reading
 * `request.jwt.claims` the same way Supabase's real implementation
 * does) to run it standalone, and executes the exact scenarios the
 * review asked for against the real PL/pgSQL function.
 *
 * This is intentionally NOT part of the required `npm test` gate for
 * every contributor: this repository has no CI-provisioned Postgres
 * (no `.github/workflows` exist at all), and requiring a local
 * PostgreSQL just to run `vitest run` would be a real regression for
 * anyone without one. So this suite probes for a reachable database at
 * import time and SKIPS ITSELF ENTIRELY (not "fails", not "fakes a
 * pass") when none is found -- see `databaseAvailable` below. In this
 * PR's own development session a real local PostgreSQL 16 WAS available
 * and these tests were run for real against it (not merely written) --
 * see the PR description for that result. Point `TEST_DATABASE_URL` at
 * any reachable Postgres (a role with CREATEDB) to run this suite
 * yourself; it defaults to `postgresql://postgres:postgres@127.0.0.1:5432/postgres`
 * purely as a local-dev convenience, never assumed to exist anywhere else.
 *
 * This does NOT stand in for a full Supabase/PostgREST integration test
 * (real Supabase also enforces the RLS policies and the JWT-issuing
 * layer this file doesn't reconstruct) -- it specifically and
 * genuinely proves the SECURITY DEFINER function's own branching logic,
 * which is exactly what this review round hardened.
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
    "[upsertPushSubscriptionRpc.integration.test] No reachable Postgres at " +
      `${BASE_CONNECTION_STRING} -- skipping the real-database RPC integration suite. ` +
      "Set TEST_DATABASE_URL to run it.",
  );
}

describe.skipIf(!databaseAvailable)("upsert_push_subscription -- real PostgreSQL execution", () => {
  const dbName = `test_push_rpc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let admin: Client;
  let db: Client;

  const USER_A = "00000000-0000-0000-0000-0000000000a1";
  const USER_B = "00000000-0000-0000-0000-0000000000b2";

  async function actingAs<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: userId })]);
    try {
      return await fn();
    } finally {
      await db.query("select set_config('request.jwt.claims', '', false)");
    }
  }

  async function actingAsAnonymous<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("select set_config('request.jwt.claims', '', false)");
    return fn();
  }

  async function upsert(endpoint: string, p256dh: string, auth: string, expirationTime: string | null = null) {
    const result = await db.query(
      "select * from public.upsert_push_subscription($1, $2, $3, $4)",
      [endpoint, p256dh, auth, expirationTime],
    );
    return result.rows[0];
  }

  beforeAll(async () => {
    admin = new Client({ connectionString: BASE_CONNECTION_STRING });
    await admin.connect();
    await admin.query(`create database ${dbName}`);

    db = new Client({ connectionString: withDatabase(BASE_CONNECTION_STRING, dbName) });
    await db.connect();

    // Minimal stand-in for Supabase's own `auth` schema -- just enough
    // for the real migration file (which references auth.users and
    // auth.uid()) to load and run unmodified. auth.uid() reads
    // request.jwt.claims the same way Supabase's actual implementation
    // does, so `actingAs`/`actingAsAnonymous` above are a faithful stand-in
    // for "which authenticated user issued this request".
    await db.query(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid
        language sql stable
        as $$
          select (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
        $$;
    `);

    // The migration's RLS policies/grants target Supabase's built-in
    // `authenticated`/`anon` roles, which don't exist on a vanilla
    // Postgres -- create bare stand-ins so `grant ... to authenticated`
    // etc. resolve. `test_anon_role` (created further below, and dropped
    // in afterAll) is the role actually used to prove "anon cannot
    // execute" from a real second connection; `anon`/`authenticated`
    // here only need to exist for the migration's own GRANT statements
    // to succeed. Roles are CLUSTER-wide (not per-database), so this is
    // idempotent -- a previous run leaving them in place is expected and
    // harmless, matching real Supabase where these roles always exist.
    await db.query(`
      do $$
      begin
        if not exists (select from pg_roles where rolname = 'authenticated') then
          create role authenticated;
        end if;
        if not exists (select from pg_roles where rolname = 'anon') then
          create role anon;
        end if;
      end
      $$;
    `);

    const migrationPath = path.join(__dirname, "..", "..", "..", "supabase", "migrations");
    const migrationFile = fs.readdirSync(migrationPath).find((name) => name.includes("push_subscriptions"));
    if (!migrationFile) throw new Error("push_subscriptions migration file not found");
    const migrationSql = fs.readFileSync(path.join(migrationPath, migrationFile), "utf8");
    await db.query(migrationSql);

    await db.query("insert into auth.users (id) values ($1), ($2)", [USER_A, USER_B]);

    // A real, unprivileged role with NO grant on the function -- the
    // closest faithful stand-in for "anon" available without a full
    // Supabase/PostgREST stack.
    await db.query("drop role if exists test_anon_role"); // survives a prior run that didn't reach afterAll
    await db.query("create role test_anon_role login password 'test_anon_pw_1234' noinherit");
    await db.query("grant usage on schema public to test_anon_role");
  }, 30_000);

  afterAll(async () => {
    if (db) {
      await db.query("drop role if exists test_anon_role").catch(() => {});
      await db.end();
    }
    if (admin) {
      await admin.query(`drop database if exists ${dbName}`).catch(() => {});
      await admin.end();
    }
  }, 30_000);

  it("1. a brand-new endpoint is inserted for the calling authenticated user", async () => {
    const row = await actingAs(USER_A, () => upsert("https://push.example/new", "p256dh-A", "auth-A"));
    expect(row.user_id).toBe(USER_A);
    expect(row.endpoint).toBe("https://push.example/new");
    expect(row.p256dh).toBe("p256dh-A");
  });

  it("2. same user + same endpoint is an idempotent update, not a new row", async () => {
    await actingAs(USER_A, () => upsert("https://push.example/idempotent", "p256dh-A", "auth-A"));
    const countBefore = await db.query(
      "select count(*)::int as n from public.push_subscriptions where endpoint = $1",
      ["https://push.example/idempotent"],
    );
    const second = await actingAs(USER_A, () => upsert("https://push.example/idempotent", "p256dh-A2", "auth-A2"));
    const countAfter = await db.query(
      "select count(*)::int as n from public.push_subscriptions where endpoint = $1",
      ["https://push.example/idempotent"],
    );

    expect(countBefore.rows[0].n).toBe(1);
    expect(countAfter.rows[0].n).toBe(1);
    expect(second.user_id).toBe(USER_A);
    expect(second.p256dh).toBe("p256dh-A2"); // refreshed in place
  });

  it("3. a different user CAN reassign the endpoint when the supplied keys match the existing stored keys (legitimate shared-device switch)", async () => {
    await actingAs(USER_A, () => upsert("https://push.example/shared-device", "shared-p256dh", "shared-auth"));

    const reassigned = await actingAs(USER_B, () =>
      upsert("https://push.example/shared-device", "shared-p256dh", "shared-auth"),
    );

    expect(reassigned.user_id).toBe(USER_B);
    const countRows = await db.query(
      "select count(*)::int as n from public.push_subscriptions where endpoint = $1",
      ["https://push.example/shared-device"],
    );
    expect(countRows.rows[0].n).toBe(1); // still one row, reassigned in place
  });

  it("4. a different user CANNOT reassign the endpoint when the supplied keys do NOT match -- fails closed", async () => {
    await actingAs(USER_A, () => upsert("https://push.example/protected", "real-p256dh", "real-auth"));

    await expect(
      actingAs(USER_B, () => upsert("https://push.example/protected", "fabricated-p256dh", "fabricated-auth")),
    ).rejects.toThrow();
  });

  it("5. a rejected reassignment attempt leaves the original owner and stored keys completely unchanged", async () => {
    await actingAs(USER_A, () => upsert("https://push.example/untouched", "original-p256dh", "original-auth"));

    await actingAs(USER_B, () =>
      upsert("https://push.example/untouched", "fabricated-p256dh", "fabricated-auth"),
    ).catch(() => {});

    const row = await db.query("select * from public.push_subscriptions where endpoint = $1", [
      "https://push.example/untouched",
    ]);
    expect(row.rows[0].user_id).toBe(USER_A);
    expect(row.rows[0].p256dh).toBe("original-p256dh");
    expect(row.rows[0].auth).toBe("original-auth");
  });

  it("6. an anonymous (unauthenticated, no EXECUTE grant) caller cannot execute the function at all", async () => {
    const anonClient = new Client({
      connectionString: withDatabase(
        BASE_CONNECTION_STRING.replace(/postgres:postgres@/, "test_anon_role:test_anon_pw_1234@"),
        dbName,
      ),
    });
    await anonClient.connect();
    try {
      await expect(
        anonClient.query("select * from public.upsert_push_subscription($1, $2, $3, $4)", [
          "https://push.example/anon-attempt",
          "p",
          "a",
          null,
        ]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await anonClient.end();
    }
  });

  it("6b. even if somehow invoked with no authenticated session at all, the function itself refuses (defense in depth beyond the grant)", async () => {
    await expect(actingAsAnonymous(() => upsert("https://push.example/no-session", "p", "a"))).rejects.toThrow(
      /requires an authenticated user/i,
    );
  });
});
