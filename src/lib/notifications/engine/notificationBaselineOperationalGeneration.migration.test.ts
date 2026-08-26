import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on
 * `supabase/migrations/*_add_notification_baseline_operational_generation.sql`
 * (spec section 22) -- mirrors `migration.test.ts`'s own scope note: this
 * does NOT execute the migration, so it can't prove the SQL compiles or
 * behaves correctly at runtime.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("notification_baseline_operational_generation"));
  expect(files.length).toBe(1);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("notification_baseline_state.last_operational_generation migration", () => {
  const sql = readMigration();

  it("adds the column as NOT NULL with a 'regular' default -- every pre-existing row (and any brand-new one) starts as regular", () => {
    expect(sql).toMatch(/add column last_operational_generation text not null default 'regular'/i);
  });

  it("constrains the value to exactly 'regular' or an 'emergency:<periodId>' generation identity -- never an arbitrary string, and never the bare word 'emergency' with no period id attached", () => {
    expect(sql).toMatch(/last_operational_generation = 'regular'/i);
    expect(sql).toMatch(/or\s+last_operational_generation ~ '\^emergency:\.\+\$'/i);
  });

  it("targets notification_baseline_state specifically -- never a different table", () => {
    expect(sql).toMatch(/alter table notification_baseline_state/i);
  });

  it("never reintroduces the old bare regular/emergency check constraint this column replaces", () => {
    expect(sql).not.toMatch(/check \(last_operational_generation in \('regular', 'emergency'\)\)/i);
    expect(sql).not.toMatch(/\blast_operational_mode\b/i);
  });
});
