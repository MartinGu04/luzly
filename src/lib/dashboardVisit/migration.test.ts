import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the security SHAPE of
 * `supabase/migrations/*_create_dashboard_visit_state.sql` -- same scope
 * note as the notification engine's own `migration.test.ts`: this does
 * NOT execute the migration, so it can't prove the SQL compiles or
 * behaves correctly at runtime.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "supabase", "migrations");

function readMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("dashboard_visit_state"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("dashboard_visit_state migration -- security shape (text-level only, see docstring)", () => {
  const sql = readMigration();

  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.dashboard_visit_state enable row level security/i);
  });

  it("declares zero RLS policies -- default-deny for anon/authenticated, same posture as notification_inbox_state", () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it("is a per-user singleton (user_id itself is the primary key)", () => {
    expect(sql).toMatch(/user_id uuid primary key references auth\.users \(id\) on delete cascade/i);
  });

  it("last_visited_at is required (not a nullable/optional cursor)", () => {
    expect(sql).toMatch(/last_visited_at timestamptz not null/i);
  });

  it("never adds a column to notification_jobs or notification_inbox_state", () => {
    expect(sql).not.toMatch(/alter table public\.notification_jobs/i);
    expect(sql).not.toMatch(/alter table public\.notification_inbox_state/i);
  });

  it("defines record_dashboard_visit as the write path, restricted to service_role only", () => {
    expect(sql).toMatch(/create or replace function public\.record_dashboard_visit/i);
    expect(sql).toMatch(/revoke all on function public\.record_dashboard_visit\(uuid, timestamptz\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.record_dashboard_visit\(uuid, timestamptz\) to service_role/i);
  });

  it("the write is monotonic -- uses greatest(...) so a stale write can never move the cutoff backwards", () => {
    expect(sql).toMatch(/greatest\(/i);
  });

  it("upserts on conflict by user_id (idempotent single-row-per-user write)", () => {
    expect(sql).toMatch(/on conflict \(user_id\) do update/i);
  });
});
