import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * There is no live Postgres in this sandbox to actually run the
 * migration against, so this is a text-level regression guard on the
 * security-critical shape of `supabase/migrations/*_push_subscriptions.sql`
 * (RLS enabled, no over-broad grants, no service-role dependency) --
 * catching an accidental regression (e.g. someone widening a grant to
 * `anon` or `public`) even though it can't verify the SQL actually runs.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "supabase", "migrations");

function readPushSubscriptionsMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("push_subscriptions"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("push_subscriptions migration -- security shape", () => {
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

  it("the upsert RPC is idempotent via ON CONFLICT (endpoint)", () => {
    expect(sql).toMatch(/on conflict\s*\(endpoint\)\s*do update/i);
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
