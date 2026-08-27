import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A text-level regression guard on the security-critical SHAPE of the
 * Emergency Mode migrations (RLS enabled + zero policies on both
 * tables, "only one active period" invariant, and both RPCs' grants
 * restricted to `service_role` only) -- mirrors
 * `src/lib/shootingRanges/migration.test.ts`'s own scope/limits: this
 * does NOT execute the migrations against real PostgreSQL, so it cannot
 * prove the SQL compiles or the RPCs are genuinely atomic under
 * concurrency -- only that the security-relevant SQL text has the shape
 * it must.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "supabase", "migrations");

function readMigration(substring: string): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes(substring));
  expect(files.length).toBe(1);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("emergency_mode_periods / emergency_mode_state migration -- security shape (text-level only, see docstring)", () => {
  const sql = readMigration("create_emergency_mode_periods");

  it("both tables enable row level security", () => {
    expect(sql).toMatch(/alter table public\.emergency_mode_periods enable row level security/i);
    expect(sql).toMatch(/alter table public\.emergency_mode_state enable row level security/i);
  });

  it("neither table ever gets a policy -- zero-policy, service-role-only posture", () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it("at most one active (deactivated_at is null) period is enforced by a partial unique index", () => {
    expect(sql).toMatch(/create unique index[\s\S]*?emergency_mode_periods[\s\S]*?where deactivated_at is null/i);
  });

  it("emergency_mode_state is a locked singleton row (id = 1)", () => {
    expect(sql).toMatch(/constraint emergency_mode_state_singleton check \(id = 1\)/i);
  });
});

describe("activate_emergency_mode / deactivate_emergency_mode RPC migration -- security shape (text-level only, see docstring)", () => {
  const sql = readMigration("add_emergency_mode_rpcs");

  it("EXECUTE is revoked from public/anon/authenticated and granted only to service_role for both RPCs", () => {
    expect(sql).toMatch(/revoke all on function public\.activate_emergency_mode[\s\S]*?from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.activate_emergency_mode[\s\S]*?to service_role/i);
    expect(sql).toMatch(/revoke all on function public\.deactivate_emergency_mode[\s\S]*?from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.deactivate_emergency_mode[\s\S]*?to service_role/i);
    expect(sql).not.toMatch(/to authenticated;/i);
  });

  it("both RPCs serialize concurrent callers via select ... for update on the singleton state row", () => {
    const forUpdateMatches = sql.match(/select \* into state_row from public\.emergency_mode_state where id = 1 for update/gi) ?? [];
    expect(forUpdateMatches.length).toBe(2);
  });

  it("activate returns already_active (never a duplicate insert) when a period is already active", () => {
    expect(sql).toMatch(/if state_row\.active_period_id is not null then[\s\S]*?'already_active'/i);
  });

  it("deactivate returns already_inactive (never re-closes) when no period is active", () => {
    expect(sql).toMatch(/if state_row\.active_period_id is null then[\s\S]*?'already_inactive'/i);
  });
});
