import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the security SHAPE of
 * `supabase/migrations/*_create_report_one_reserve_inclusion.sql` -- same
 * scope note as `lib/dashboardVisit/migration.test.ts`: this does NOT
 * execute the migration, so it can't prove the SQL compiles or behaves
 * correctly at runtime.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "supabase", "migrations");

function readMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("report_one_reserve_inclusion"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("report_one_reserve_inclusion migration -- security shape (text-level only, see docstring)", () => {
  const sql = readMigration();

  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.report_one_reserve_inclusion enable row level security/i);
  });

  it("declares zero RLS policies -- default-deny for anon/authenticated", () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it("18. keyed by the stable person_id (never a display name)", () => {
    expect(sql).toMatch(/person_id text primary key/i);
  });

  it("included is required (not a nullable/tri-state flag)", () => {
    expect(sql).toMatch(/included boolean not null/i);
  });

  it("never adds a column to an unrelated existing table", () => {
    expect(sql).not.toMatch(/alter table public\.notification_jobs/i);
    expect(sql).not.toMatch(/alter table public\.dashboard_visit_state/i);
  });
});
