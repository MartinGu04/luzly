import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A text-level regression guard on the security-critical SHAPE of the
 * מטווחים feature's three migrations (RLS enabled + zero policies on both
 * tables, and the atomic confirmation RPC's grant restricted to
 * `service_role` only) -- catching an accidental future widening (e.g.
 * someone adding an `authenticated`-scoped policy, or granting the RPC to
 * `authenticated`/`anon`/`public`) purely by inspecting the SQL text.
 *
 * IMPORTANT SCOPE NOTE: this file does NOT execute the migrations against
 * a real PostgreSQL server, so it cannot prove the SQL actually compiles
 * or behaves correctly, and in particular cannot prove the RPC's atomicity/
 * concurrency-safety on its own -- that genuine runtime proof (including
 * the concurrent-confirmation race this RPC exists to close) lives in
 * `confirmShootingRangeOccurrencesRpc.integration.test.ts`, which runs the
 * ACTUAL migration files against a real local PostgreSQL.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "supabase", "migrations");

function readMigration(substring: string): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes(substring));
  expect(files.length).toBe(1);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("shooting_range_completions / shooting_range_planned_occurrences migrations -- security shape (text-level only, see docstring)", () => {
  const completionsSql = readMigration("create_shooting_range_completions");
  const occurrencesSql = readMigration("create_shooting_range_planned_occurrences");

  it("both tables enable row level security", () => {
    expect(completionsSql).toMatch(/alter table public\.shooting_range_completions enable row level security/i);
    expect(occurrencesSql).toMatch(/alter table public\.shooting_range_planned_occurrences enable row level security/i);
  });

  it("neither migration ever creates a policy -- zero-policy, service-role-only posture (same as report_one_reserve_inclusion/dashboard_visit_state)", () => {
    expect(completionsSql).not.toMatch(/create policy/i);
    expect(occurrencesSql).not.toMatch(/create policy/i);
  });

  it("completions' source/status columns are constrained to the documented enum values only", () => {
    expect(completionsSql).toMatch(/check \(source in \('sheet_baseline', 'self_report', 'planned_range_confirmation', 'manager_manual'\)\)/i);
    expect(completionsSql).toMatch(/check \(status in \('pending', 'approved', 'rejected'\)\)/i);
  });

  it("planned occurrences are unique per (range_date, person_id) -- never a duplicate row for the same scheduling", () => {
    expect(occurrencesSql).toMatch(/unique\s*\(range_date,\s*person_id\)/i);
  });
});

describe("confirm_shooting_range_occurrences RPC migration -- security shape (text-level only, see docstring)", () => {
  const sql = readMigration("add_confirm_shooting_range_occurrences_rpc");

  it("EXECUTE is revoked from public/anon/authenticated and granted only to service_role", () => {
    expect(sql).toMatch(/revoke all on function public\.confirm_shooting_range_occurrences[\s\S]*?from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.confirm_shooting_range_occurrences[\s\S]*?to service_role/i);
    expect(sql).not.toMatch(/to authenticated;/i);
  });

  it("resolves the confirmed vs. not_completed sets by array-membership exclusion, never by re-reading a sibling CTE's own write (the classic multi-CTE-write visibility trap)", () => {
    expect(sql).toMatch(/not \(shooting_range_planned_occurrences\.person_id = any\(p_confirmed_person_ids\)\)/i);
  });

  it("every status transition is guarded by status = 'planned' -- an already-resolved row can never be re-resolved by a later/concurrent call", () => {
    const updateBlocks =
      sql.match(/update public\.shooting_range_planned_occurrences[\s\S]*?returning shooting_range_planned_occurrences\.person_id/gi) ?? [];
    expect(updateBlocks.length).toBe(2);
    for (const block of updateBlocks) {
      expect(block).toMatch(/status = 'planned'/i);
    }
  });

  it("each completion insert is driven by its own update's RETURNING set, not an independent re-derivation", () => {
    expect(sql).toMatch(/from confirmed c/i);
    expect(sql).toMatch(/from not_completed n/i);
  });
});
