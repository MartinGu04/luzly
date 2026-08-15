import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A text-level regression guard on the security-critical SHAPE of
 * `supabase/migrations/*_push_subscriptions.sql` (RLS enabled, no
 * over-broad grants, no service-role dependency, the cross-user
 * reassignment key check) -- catching an accidental regression (e.g.
 * someone widening a grant to `anon`/`public`, or dropping the key-match
 * check) purely by inspecting the SQL text.
 *
 * IMPORTANT SCOPE NOTE: this file does NOT execute the migration against
 * a real PostgreSQL server, so it cannot prove the SQL actually compiles
 * or behaves correctly at runtime (a typo in the PL/pgSQL body, a wrong
 * branch, an off-by-one in the exception handling -- none of that would
 * be caught here). A genuine runtime proof of the exact scenarios this
 * PR's review asked for (new endpoint / same-user idempotent / matching-
 * key reassignment / mismatched-key rejection / untouched-on-failure /
 * anon-cannot-execute) lives in `upsertPushSubscriptionRpc.integration.test.ts`,
 * which runs the ACTUAL migration file against a real local PostgreSQL --
 * see that file's own docstring for why it's a separate, self-skipping
 * suite rather than part of this one.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "supabase", "migrations");

function readPushSubscriptionsMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("push_subscriptions"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("push_subscriptions migration -- security shape (text-level only, see docstring)", () => {
  const sql = readPushSubscriptionsMigration();

  it("enables row level security on the table", () => {
    expect(sql).toMatch(/alter table public\.push_subscriptions enable row level security/i);
  });

  it("declares endpoint as globally unique -- one physical subscription can never belong to two users at once", () => {
    expect(sql).toMatch(/unique\s*\(endpoint\)/i);
  });

  it("grants SELECT/DELETE directly only to 'authenticated', never to 'anon' or 'public'", () => {
    const policyLines = sql.match(/create policy[\s\S]*?;/gi) ?? [];
    expect(policyLines.length).toBeGreaterThanOrEqual(2);
    for (const policy of policyLines) {
      expect(policy).toMatch(/to authenticated/i);
      expect(policy).not.toMatch(/to anon/i);
      expect(policy).not.toMatch(/to public/i);
    }
  });

  it("declares no direct INSERT/UPDATE policy -- creation/reassignment only via the SECURITY DEFINER RPC", () => {
    expect(sql).not.toMatch(/create policy[\s\S]{0,200}for insert/i);
    expect(sql).not.toMatch(/create policy[\s\S]{0,200}for update/i);
  });

  it("the upsert RPC is SECURITY DEFINER, derives ownership from auth.uid() (never a client-supplied user id parameter), and pins search_path", () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*public/i);
    expect(sql).toMatch(/auth\.uid\(\)/);
    expect(sql).not.toMatch(/p_user_id/i);
  });

  it("the upsert RPC's EXECUTE grant is restricted to 'authenticated', explicitly revoked from public first", () => {
    expect(sql).toMatch(/revoke all on function public\.upsert_push_subscription[\s\S]*?from public/i);
    expect(sql).toMatch(/grant execute on function public\.upsert_push_subscription[\s\S]*?to authenticated/i);
  });

  it("reassigning an endpoint already owned by a DIFFERENT user requires the supplied p256dh AND auth to match the stored values", () => {
    expect(sql).toMatch(/existing\.p256dh\s*=\s*p_p256dh\s+and\s+existing\.auth\s*=\s*p_auth/i);
  });

  it("locks the target row (SELECT ... FOR UPDATE) before deciding whether to reassign -- no check-then-write race window", () => {
    expect(sql).toMatch(/select \* into existing from public\.push_subscriptions where endpoint = p_endpoint for update/i);
  });

  it("fails closed with a generic exception on a key mismatch -- never names the existing owner or reveals stored values", () => {
    const exceptionLines = sql.match(/raise exception[^;]*;/gi) ?? [];
    expect(exceptionLines.length).toBeGreaterThanOrEqual(2);
    for (const line of exceptionLines) {
      expect(line).not.toMatch(/existing\.user_id/i);
      expect(line).not.toMatch(/existing\.p256dh/i);
      expect(line).not.toMatch(/existing\.auth\b/i);
    }
  });

  it("same-user re-registration is an idempotent UPDATE, not a fresh INSERT", () => {
    expect(sql).toMatch(/if existing\.user_id = auth\.uid\(\) then[\s\S]{0,200}update public\.push_subscriptions/i);
  });

  it("handles a concurrent-insert race for a brand-new endpoint (unique_violation) rather than erroring outright", () => {
    expect(sql).toMatch(/exception when unique_violation then/i);
  });

  it("cascades deletion when the owning auth user is deleted", () => {
    expect(sql).toMatch(/references auth\.users\s*\(id\)\s*on delete cascade/i);
  });

  it("never references a service-role/secret key -- matches this codebase's zero-service-role Supabase convention", () => {
    expect(sql).not.toMatch(/service[_-]?role/i);
  });

  it("stores no unnecessary device fingerprinting or personal metadata columns", () => {
    // Checks actual COLUMN definitions ("name type,"/"name type\n"), not
    // prose -- the migration's own comments legitimately explain that it
    // deliberately avoids fingerprinting, which would otherwise false-
    // positive a plain substring search.
    for (const forbidden of ["user_agent", "device_id", "ip_address", "fingerprint"]) {
      expect(sql.toLowerCase()).not.toMatch(new RegExp(`^\\s*${forbidden}\\s+\\w`, "m"));
    }
  });
});
