import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the dynamic-audience-groups/exclusions
 * migration -- mirrors `systemRuleCopyAudienceMigration.test.ts`'s own
 * scope note: this does NOT execute the migration, only asserts its
 * textual shape (no live Postgres available in this environment).
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readMigrationFile(substring: string): { name: string; sql: string } {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes(substring));
  expect(files.length).toBeGreaterThan(0);
  return { name: files[0], sql: fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8") };
}

describe("dynamic audience groups/exclusions migration -- additive, never amends an already-applied migration", () => {
  const migration = readMigrationFile("add_audience_groups_and_exclusions");
  const { sql } = migration;

  it("is a genuinely SEPARATE file from every prior notification_rules migration", () => {
    const created = readMigrationFile("create_notification_rules");
    const copyAudience = readMigrationFile("system_rule_copy_audience");
    expect(migration.name).not.toBe(created.name);
    expect(migration.name).not.toBe(copyAudience.name);
  });

  it("only ever ALTERs existing tables -- never a create/drop/truncate of them", () => {
    expect(sql).not.toMatch(/create table(?!\s+if not exists)/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/truncate/i);
  });

  it("adds notification_rules' four new columns with defaults that reproduce current behavior", () => {
    expect(sql).toMatch(/add column if not exists system_audience_group_keys text\[\] not null default '\{\}',/);
    expect(sql).toMatch(/add column if not exists system_excluded_person_ids text\[\] not null default '\{\}',/);
    expect(sql).toMatch(/add column if not exists audience_group_keys text\[\] not null default '\{\}',/);
    expect(sql).toMatch(/add column if not exists excluded_person_ids text\[\] not null default '\{\}';/);
  });

  it("widens system_audience_mode to also allow 'groups', via drop+re-add (never editing the check in place)", () => {
    expect(sql).toMatch(/drop constraint notification_rules_system_audience_mode_check;/);
    expect(sql).toMatch(/check \(system_audience_mode in \('all_eligible', 'selected', 'groups'\)\);/);
  });

  it("widens audience_kind (custom_weekly/manual/scheduled) to also allow 'groups' on every affected table", () => {
    expect(sql).toMatch(/check \(audience_kind is null or audience_kind in \('person', 'people', 'everyone', 'groups'\)\);/);
    expect(sql.match(/check \(audience_kind in \('person', 'people', 'everyone', 'groups'\)\);/g)?.length).toBe(2); // manager_notification_batches + manager_scheduled_broadcasts
  });

  it("widens the notification_rules shape check to keep the new columns correctly scoped per row kind", () => {
    expect(sql).toMatch(/drop constraint notification_rules_system_shape_check;/);
    expect(sql).toMatch(/and audience_group_keys = '\{\}'\s*\n\s*and excluded_person_ids = '\{\}'/);
    expect(sql).toMatch(/and system_audience_group_keys = '\{\}'\s*\n\s*and system_excluded_person_ids = '\{\}'/);
  });

  it("adds the same two intent columns to manager_notification_batches and manager_scheduled_broadcasts", () => {
    expect(sql).toMatch(/alter table public\.manager_notification_batches\s*\n\s*add column if not exists audience_group_keys/);
    expect(sql).toMatch(/alter table public\.manager_scheduled_broadcasts\s*\n\s*add column if not exists audience_group_keys/);
  });

  it("adds frozen_audience_group_keys/frozen_excluded_person_ids to notification_rule_occurrences and widens its audience_kind check", () => {
    expect(sql).toMatch(/alter table public\.notification_rule_occurrences\s*\n\s*add column if not exists frozen_audience_group_keys/);
    expect(sql).toMatch(/check \(frozen_audience_kind in \('person', 'people', 'everyone', 'groups'\)\);/);
  });

  it("leaves both predecessor RPCs completely untouched -- no drop of either", () => {
    expect(sql).not.toMatch(/drop function public\.update_system_rule_configuration_and_invalidate_pending_jobs\(/);
    expect(sql).not.toMatch(/drop function public\.claim_notification_rule_occurrence\(/);
    // Neither predecessor's own (narrower) signature is redefined here --
    // only ever referenced in prose, and only ever as a strict prefix of
    // the new `_v2` function names.
    expect(sql).not.toMatch(/create or replace function public\.update_system_rule_configuration_and_invalidate_pending_jobs\(/);
    expect(sql).not.toMatch(/create or replace function public\.claim_notification_rule_occurrence\(/);
  });

  it("adds genuinely NEW, differently-named _v2 RPCs rather than replacing the old ones", () => {
    expect(sql).toMatch(/create or replace function public\.update_system_rule_configuration_and_invalidate_pending_jobs_v2\(/);
    expect(sql).toMatch(/create or replace function public\.claim_notification_rule_occurrence_v2\(/);
  });

  it("update_system_rule_configuration_and_invalidate_pending_jobs_v2 keeps the SAME revision-guard/hard-delete semantics plus the two new params", () => {
    const fnBlock = sql.match(/create or replace function public\.update_system_rule_configuration_and_invalidate_pending_jobs_v2[\s\S]*?\$\$;/);
    expect(fnBlock).not.toBeNull();
    expect(fnBlock![0]).toMatch(/p_audience_group_keys text\[\],\s*\n\s*p_excluded_person_ids text\[\],/);
    expect(fnBlock![0]).toMatch(/select \* into rule_row from public\.notification_rules where id = p_rule_id for update;/);
    expect(fnBlock![0]).toMatch(/if rule_row\.revision is distinct from p_expected_revision then\s*\n\s*return; -- stale Manager edit/);
    expect(fnBlock![0]).toMatch(/system_audience_group_keys = coalesce\(p_audience_group_keys, '\{\}'\),/);
    expect(fnBlock![0]).toMatch(/system_excluded_person_ids = coalesce\(p_excluded_person_ids, '\{\}'\),/);
    expect(fnBlock![0]).toMatch(/revision = revision \+ 1,/);
    expect(fnBlock![0]).toMatch(/delete from public\.notification_jobs\s*\n\s*where category = updated_row\.system_key and status = 'pending';/);
  });

  it("claim_notification_rule_occurrence_v2 keeps the SAME at-most-once/lease/resume semantics plus the two new frozen columns", () => {
    const fnBlock = sql.match(/create or replace function public\.claim_notification_rule_occurrence_v2[\s\S]*?\$\$;/);
    expect(fnBlock).not.toBeNull();
    expect(fnBlock![0]).toMatch(/rule_audience_group_keys text\[\],\s*\n\s*rule_excluded_person_ids text\[\],/);
    // Resume branch: never re-reads `notification_rules`, only the occurrence's own frozen snapshot.
    expect(fnBlock![0]).toMatch(
      /existing_row\.frozen_audience_kind, existing_row\.frozen_target_person_ids,\s*\n\s*existing_row\.frozen_audience_group_keys, existing_row\.frozen_excluded_person_ids,/,
    );
    // Fresh claim: still locks + revalidates the rule row before ever inserting.
    expect(fnBlock![0]).toMatch(/select \* into rule_row from public\.notification_rules where id = p_rule_id for update;/);
    expect(fnBlock![0]).toMatch(/if extract\(dow from p_occurrence_date\)::smallint is distinct from rule_row\.weekday then/);
    expect(fnBlock![0]).toMatch(/rule_row\.audience_group_keys, rule_row\.excluded_person_ids,/);
  });

  it("both new RPCs are revoked from public/anon/authenticated and granted only to service_role", () => {
    expect(sql).toMatch(
      /revoke all on function public\.update_system_rule_configuration_and_invalidate_pending_jobs_v2\(/,
    );
    expect(sql).toMatch(/grant execute on function public\.update_system_rule_configuration_and_invalidate_pending_jobs_v2\(/);
    expect(sql).toMatch(/revoke all on function public\.claim_notification_rule_occurrence_v2\(uuid, date, integer\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.claim_notification_rule_occurrence_v2\(uuid, date, integer\) to service_role;/);
  });

  it("documents the rollout-compatibility reasoning for keeping both predecessor RPCs alongside the new ones", () => {
    expect(sql).toMatch(/DELIBERATELY LEFT IN\s*\n-- PLACE, unmodified/);
    expect(sql).toMatch(/already-deployed old app instance/i);
  });
});
