import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on
 * `supabase/migrations/*_add_notification_baseline_operational_mode.sql`
 * (spec section 22) -- mirrors `migration.test.ts`'s own scope note: this
 * does NOT execute the migration, so it can't prove the SQL compiles or
 * behaves correctly at runtime.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("notification_baseline_operational_mode"));
  expect(files.length).toBe(1);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("notification_baseline_state.last_operational_mode migration", () => {
  const sql = readMigration();

  it("adds the column as NOT NULL with a 'regular' default -- every pre-existing row (and any brand-new one) starts as regular", () => {
    expect(sql).toMatch(/add column last_operational_mode text not null default 'regular'/i);
  });

  it("constrains the value to exactly 'regular'/'emergency' -- never an arbitrary string", () => {
    expect(sql).toMatch(/check \(last_operational_mode in \('regular', 'emergency'\)\)/i);
  });

  it("targets notification_baseline_state specifically -- never a different table", () => {
    expect(sql).toMatch(/alter table notification_baseline_state/i);
  });
});
