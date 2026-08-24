import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the editable-SYSTEM-copy/audience
 * follow-up migration -- mirrors `notificationRulesMigration.test.ts`'s
 * own scope note: this does NOT execute the migration, only asserts its
 * textual shape. Deliberately matches on "system_rule_copy_audience" (NOT
 * "notification_rules") so this never accidentally picks up the PR #93
 * migration file instead -- the two are asserted to be genuinely
 * DIFFERENT files below.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readMigrationFile(substring: string): { name: string; sql: string } {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes(substring));
  expect(files.length).toBeGreaterThan(0);
  return { name: files[0], sql: fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8") };
}

describe("editable system-rule copy/audience migration -- additive, never amends the already-applied PR #93 migration", () => {
  const copyAudienceMigration = readMigrationFile("system_rule_copy_audience");
  const { sql } = copyAudienceMigration;

  it("is a genuinely SEPARATE file from the PR #93 create_notification_rules migration", () => {
    const original = readMigrationFile("create_notification_rules");
    expect(copyAudienceMigration.name).not.toBe(original.name);
  });

  it("only ever ALTERs notification_rules -- never a create table/drop table/truncate of it", () => {
    expect(sql).not.toMatch(/create table(?!\s+if not exists public\.notification_rules\s*\()/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/truncate/i);
  });

  it("adds the four new columns, all with defaults that reproduce current production behavior", () => {
    expect(sql).toMatch(/add column if not exists system_title_override text,/);
    expect(sql).toMatch(/add column if not exists system_body_override text,/);
    expect(sql).toMatch(/add column if not exists system_audience_mode text not null default 'all_eligible',/);
    expect(sql).toMatch(/add column if not exists system_target_person_ids text\[\] not null default '\{\}';/);
  });

  it("constrains system_audience_mode to exactly 'all_eligible' or 'selected'", () => {
    expect(sql).toMatch(/check \(system_audience_mode in \('all_eligible', 'selected'\)\)/);
  });

  it("widens the system/custom_weekly shape check (drop + re-add, not editing the original migration) so a custom_weekly row can never carry a non-default value in any new column", () => {
    expect(sql).toMatch(/drop constraint notification_rules_system_shape_check;/);
    expect(sql).toMatch(/add constraint notification_rules_system_shape_check check \(/);
    expect(sql).toMatch(/and system_title_override is null\s*\n\s*and system_body_override is null\s*\n\s*and system_audience_mode = 'all_eligible'\s*\n\s*and system_target_person_ids = '\{\}'/);
  });

  it("leaves the PR #93 update_system_rule_and_invalidate_pending_jobs RPC completely untouched -- no drop/replace of it in this file", () => {
    expect(sql).not.toMatch(/drop function public\.update_system_rule_and_invalidate_pending_jobs/i);
    // The old (six-argument) RPC name is never redefined here -- only ever referenced in prose, and only ever as a strict prefix of the NEW ten-argument RPC's own name.
    expect(sql).not.toMatch(/create or replace function public\.update_system_rule_and_invalidate_pending_jobs\(/);
  });

  it("adds a genuinely NEW, differently-named RPC rather than replacing the old one", () => {
    expect(sql).toMatch(/create or replace function public\.update_system_rule_configuration_and_invalidate_pending_jobs\(/);
  });

  it("the new RPC updates enabled/time/copy/audience AND increments revision, all in the SAME statement", () => {
    const fnBlock = sql.match(/create or replace function public\.update_system_rule_configuration_and_invalidate_pending_jobs[\s\S]*?\$\$;/);
    expect(fnBlock).not.toBeNull();
    expect(fnBlock![0]).toMatch(/set enabled = p_enabled,/);
    expect(fnBlock![0]).toMatch(/system_title_override = p_title_override,/);
    expect(fnBlock![0]).toMatch(/system_body_override = p_body_override,/);
    expect(fnBlock![0]).toMatch(/system_audience_mode = p_audience_mode,/);
    expect(fnBlock![0]).toMatch(/system_target_person_ids = coalesce\(p_target_person_ids, '\{\}'\),/);
    expect(fnBlock![0]).toMatch(/revision = revision \+ 1,/);
    expect(fnBlock![0]).toMatch(/where id = p_rule_id and kind = 'system'/);
  });

  it("the new RPC hard-deletes still-pending jobs for the category in the SAME transaction, exactly like the PR #93 RPC", () => {
    const fnBlock = sql.match(/create or replace function public\.update_system_rule_configuration_and_invalidate_pending_jobs[\s\S]*?\$\$;/);
    expect(fnBlock).not.toBeNull();
    expect(fnBlock![0]).toMatch(/delete from public\.notification_jobs\s*\n\s*where category = updated_row\.system_key and status = 'pending';/);
  });

  it("returns zero rows for a not-found/non-system id, never touching notification_jobs in that case", () => {
    const fnBlock = sql.match(/create or replace function public\.update_system_rule_configuration_and_invalidate_pending_jobs[\s\S]*?\$\$;/);
    expect(fnBlock).not.toBeNull();
    expect(fnBlock![0]).toMatch(/if updated_row\.id is null then\s*\n\s*return; -- not found \/ not a system row/);
  });

  it("is revoked from public/anon/authenticated and granted only to service_role", () => {
    expect(sql).toMatch(
      /revoke all on function public\.update_system_rule_configuration_and_invalidate_pending_jobs\(\s*\n\s*uuid, boolean, smallint, smallint, text, text, text, text\[\], text, text\s*\n\s*\) from public, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.update_system_rule_configuration_and_invalidate_pending_jobs\(\s*\n\s*uuid, boolean, smallint, smallint, text, text, text, text\[\], text, text\s*\n\s*\) to service_role;/,
    );
  });

  it("documents the rollout-compatibility reasoning for keeping the old RPC alongside the new one", () => {
    expect(sql).toMatch(/DELIBERATELY LEFT\s*\n-- IN PLACE, unmodified/);
    expect(sql).toMatch(/already-deployed OLD app instance/);
  });
});
