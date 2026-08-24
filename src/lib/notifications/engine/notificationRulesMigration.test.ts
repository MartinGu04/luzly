import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on `supabase/migrations/*_create_notification_rules.sql`,
 * the Fixed / Recurring Notifications Center's schema -- mirrors
 * `migration.test.ts`'s own scope note: this does NOT execute the
 * migration, only asserts its textual shape (RLS, idempotent seed,
 * identity-protection trigger, one row per system category).
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readNotificationRulesMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("notification_rules"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

const SYSTEM_KEYS = [
  "tomorrow_shift",
  "tomorrow_duty",
  "tomorrow_logistics_withdrawal",
  "tomorrow_logistics_withdrawal_supervisor",
  "logistics_withdrawal_noon_assigned",
  "logistics_withdrawal_noon_supervisor",
  "logistics_withdrawal_noon_team",
  "almash_check_in",
  "constraints_sunday",
  "constraints_monday",
];

describe("notification_rules migration -- security + shape (text-level only, see docstring)", () => {
  const sql = readNotificationRulesMigration();

  it("enables row level security and declares zero policies -- default-deny, same as every other engine table", () => {
    expect(sql).toMatch(/alter table public\.notification_rules enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("seeds every existing fixed reminder category exactly once", () => {
    for (const key of SYSTEM_KEYS) {
      expect(sql).toMatch(new RegExp(`\\('system', '${key}',`));
    }
    // Exactly one seed statement covering all ten -- not one insert per row.
    expect(sql.match(/insert into public\.notification_rules/gi)?.length).toBe(1);
  });

  it("seed matches current production send times from notificationTiming.ts", () => {
    expect(sql).toMatch(/'tomorrow_shift', true, 20, 0/);
    expect(sql).toMatch(/'tomorrow_duty', true, 20, 0/);
    expect(sql).toMatch(/'tomorrow_logistics_withdrawal', true, 20, 0/);
    expect(sql).toMatch(/'tomorrow_logistics_withdrawal_supervisor', true, 20, 0/);
    expect(sql).toMatch(/'logistics_withdrawal_noon_assigned', true, 12, 0/);
    expect(sql).toMatch(/'logistics_withdrawal_noon_supervisor', true, 12, 0/);
    expect(sql).toMatch(/'logistics_withdrawal_noon_team', true, 12, 0/);
    expect(sql).toMatch(/'almash_check_in', true, 12, 45/);
    expect(sql).toMatch(/'constraints_sunday', true, 18, 0/);
    expect(sql).toMatch(/'constraints_monday', true, 9, 0/);
  });

  it("seed is idempotent -- on conflict do nothing, keyed on the partial system_key unique index", () => {
    expect(sql).toMatch(/on conflict \(system_key\) where kind = 'system' do nothing/i);
  });

  it("one system rule per category, enforced at the database level", () => {
    expect(sql).toMatch(
      /create unique index if not exists notification_rules_system_key_unique[\s\S]*?on public\.notification_rules \(system_key\)[\s\S]*?where kind = 'system'/i,
    );
  });

  it("a system row can never carry weekday/title/body/audience, and a custom_weekly row must", () => {
    expect(sql).toMatch(/notification_rules_system_shape_check/);
    expect(sql).toMatch(/kind = 'system'\s*\n\s*and system_key is not null\s*\n\s*and weekday is null/);
    expect(sql).toMatch(/kind = 'custom_weekly'\s*\n\s*and system_key is null\s*\n\s*and weekday is not null/);
  });

  it("a system rule's kind/system_key is immutable at the database level, independent of application-layer care", () => {
    expect(sql).toMatch(/notification_rules_protect_identity/);
    expect(sql).toMatch(/new\.kind is distinct from old\.kind/);
    expect(sql).toMatch(/new\.system_key is distinct from old\.system_key/);
    expect(sql).toMatch(/before update on public\.notification_rules/);
  });

  it("local_hour/local_minute/weekday are range-constrained", () => {
    expect(sql).toMatch(/local_hour_check check \(local_hour between 0 and 23\)/);
    expect(sql).toMatch(/local_minute_check check \(local_minute between 0 and 59\)/);
    expect(sql).toMatch(/weekday_check check \(weekday is null or weekday between 0 and 6\)/);
  });

  it("audience_kind is restricted to the same person/people/everyone shape manager broadcasts already use", () => {
    expect(sql).toMatch(/audience_kind is null or audience_kind in \('person', 'people', 'everyone'\)/);
  });
});
