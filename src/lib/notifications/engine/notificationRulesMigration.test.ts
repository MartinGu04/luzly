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

describe("notification_rule_occurrences -- the recurring-rule at-most-once claim boundary", () => {
  const sql = readNotificationRulesMigration();

  it("enables row level security and declares zero policies -- default-deny, same as every other engine table", () => {
    expect(sql).toMatch(/alter table public\.notification_rule_occurrences enable row level security/i);
  });

  it("one row per (rule_id, occurrence_date), enforced at the database level", () => {
    expect(sql).toMatch(/notification_rule_occurrences_unique unique \(rule_id, occurrence_date\)/i);
  });

  it("status is restricted to claimed/completed only", () => {
    expect(sql).toMatch(/notification_rule_occurrences_status_check check \(status in \('claimed', 'completed'\)\)/);
  });

  it("batch_id references manager_notification_batches -- the dispatch checkpoint, not the completion marker", () => {
    expect(sql).toMatch(/batch_id uuid references public\.manager_notification_batches \(id\)/);
  });

  it("the claim function is revoked from public/anon/authenticated and granted only to service_role", () => {
    expect(sql).toMatch(
      /revoke all on function public\.claim_notification_rule_occurrence\(uuid, date, integer\)[\s\S]*?from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.claim_notification_rule_occurrence\(uuid, date, integer\)[\s\S]*?to service_role/i,
    );
  });

  it("a completed occurrence always returns zero rows -- the sole terminal marker", () => {
    expect(sql).toMatch(/if existing_row\.status = 'completed' then\s*\n\s*return; -- genuinely done/);
  });

  it("an actively-leased (non-stale) claim also returns zero rows -- never a concurrent second claim of the same live occurrence", () => {
    expect(sql).toMatch(/existing_row\.claimed_at >= now\(\) - make_interval\(secs => p_lease_seconds\)/);
  });

  it("a stale claim resumes unconditionally, independent of the rule's current enabled state", () => {
    expect(sql).toMatch(/Stale claim -- resume UNCONDITIONALLY/);
  });

  it("a fresh claim locks the rule row (for update) before ever inserting the occurrence, closing the disable-before-claim race", () => {
    expect(sql).toMatch(/select \* into rule_row from public\.notification_rules where id = p_rule_id for update;/);
    expect(sql).toMatch(/rule_row\.enabled is not true/);
    expect(sql).toMatch(/rule_row\.archived_at is not null/);
  });

  it("a fresh claim is a plain on-conflict-do-nothing insert -- concurrent callers can never both win it", () => {
    expect(sql).toMatch(/on conflict \(rule_id, occurrence_date\) do nothing/);
  });

  it("stores a frozen content snapshot on the occurrence row itself -- not null, so it must be captured at fresh-claim time", () => {
    expect(sql).toMatch(/frozen_title text not null/);
    expect(sql).toMatch(/frozen_body text not null/);
    expect(sql).toMatch(/frozen_audience_kind text not null/);
    expect(sql).toMatch(/frozen_target_person_ids text\[\] not null default '\{\}'/);
  });

  it("a fresh claim inserts the frozen snapshot FROM the locked rule row", () => {
    expect(sql).toMatch(
      /frozen_title, frozen_body, frozen_audience_kind, frozen_target_person_ids,[\s\S]{0,80}frozen_created_by_person_id, frozen_created_by_person_name[\s\S]{0,20}\)\s*\n\s*values\s*\(\s*\n\s*p_rule_id, p_occurrence_date, 'claimed', now\(\),\s*\n\s*rule_row\.title, rule_row\.body, rule_row\.audience_kind, rule_row\.target_person_ids/,
    );
  });

  it("a resume returns the occurrence's OWN frozen_* columns -- never re-selects notification_rules for content", () => {
    const resumeBlock = sql.match(/-- Stale claim -- resume UNCONDITIONALLY[\s\S]*?return;\s*\n\s*end if;/);
    expect(resumeBlock).not.toBeNull();
    expect(resumeBlock![0]).toMatch(/existing_row\.frozen_title, existing_row\.frozen_body/);
    expect(resumeBlock![0]).not.toMatch(/select \* into rule_row from public\.notification_rules/);
  });

  it("a fresh claim re-validates the CURRENT weekday against the locked rule row -- a stale candidate for the OLD weekday is refused", () => {
    expect(sql).toMatch(/extract\(dow from p_occurrence_date\)::smallint is distinct from rule_row\.weekday/);
  });

  it("a fresh claim re-validates the CURRENT local time using a real Asia/Jerusalem conversion -- never implicit server/DB timezone", () => {
    expect(sql).toMatch(/at time zone 'Asia\/Jerusalem'/);
    expect(sql).toMatch(/now\(\) < due_instant/);
  });

  it("resume is never gated on the rule's current schedule/enabled/archived state -- only the fresh-claim branch checks any of that", () => {
    const freshClaimStart = sql.indexOf("-- Fresh claim -- lock the rule row FIRST");
    const resumeBlock = sql.slice(0, freshClaimStart);
    expect(resumeBlock).not.toMatch(/rule_row\.enabled/);
    expect(resumeBlock).not.toMatch(/extract\(dow/);
  });
});

describe("recovery-discoverability -- a claimed occurrence must be findable independent of current rule due-matching", () => {
  const sql = readNotificationRulesMigration();

  it("indexes claimed occurrences by claimed_at alone -- discoverable without joining/matching against notification_rules at all", () => {
    expect(sql).toMatch(
      /create index if not exists notification_rule_occurrences_claimed_idx\s*\n\s*on public\.notification_rule_occurrences \(claimed_at\)\s*\n\s*where status = 'claimed'/,
    );
  });
});

describe("update_system_rule_and_invalidate_pending_jobs -- atomic system-rule edit + pending-job invalidation", () => {
  const sql = readNotificationRulesMigration();

  it("is revoked from public/anon/authenticated and granted only to service_role", () => {
    expect(sql).toMatch(
      /revoke all on function public\.update_system_rule_and_invalidate_pending_jobs\(uuid, boolean, smallint, smallint, text, text\)[\s\S]*?from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.update_system_rule_and_invalidate_pending_jobs\(uuid, boolean, smallint, smallint, text, text\)[\s\S]*?to service_role/i,
    );
  });

  it("guards the rule update to kind = 'system' -- can never touch a custom_weekly row", () => {
    expect(sql).toMatch(/where id = p_rule_id and kind = 'system'/);
  });

  it("deletes (never soft-cancels) still-pending jobs for that exact category in the SAME function", () => {
    expect(sql).toMatch(/delete from public\.notification_jobs\s*\n\s*where category = updated_row\.system_key and status = 'pending';/);
  });

  it("documents why a hard delete is used instead of a soft cancel -- the revival trap in upsert_pending_reminder_job's own WHERE guard", () => {
    expect(sql).toMatch(/can NEVER be revived back to 'pending'/);
  });

  it("never touches notification_deliveries or any terminal job status -- only status = 'pending' rows are affected", () => {
    const fnBlock = sql.match(/create or replace function public\.update_system_rule_and_invalidate_pending_jobs[\s\S]*?\$\$;/);
    expect(fnBlock).not.toBeNull();
    expect(fnBlock![0]).not.toMatch(/notification_deliveries/);
    expect(fnBlock![0]).toMatch(/status = 'pending'/);
  });

  it("returns zero rows for a not-found/non-system id, never touching notification_jobs in that case", () => {
    expect(sql).toMatch(/if updated_row\.id is null then\s*\n\s*return; -- not found \/ not a system row/);
  });

  it("increments revision atomically in the SAME update statement -- the stale-worker-config guard's other half", () => {
    expect(sql).toMatch(/set enabled = p_enabled,\s*\n\s*local_hour = p_local_hour,\s*\n\s*local_minute = p_local_minute,\s*\n\s*revision = revision \+ 1,/);
  });
});

describe("notification_rules.revision -- the stale-worker-config guard column", () => {
  const sql = readNotificationRulesMigration();

  it("is a monotonic bigint, defaulting to 1, on every row of either kind", () => {
    expect(sql).toMatch(/revision bigint not null default 1,/);
  });
});

describe("upsert_pending_system_reminder_job -- the guarded, revision-checked system reminder job upsert", () => {
  const sql = readNotificationRulesMigration();

  it("is revoked from public/anon/authenticated and granted only to service_role", () => {
    expect(sql).toMatch(
      /revoke all on function public\.upsert_pending_system_reminder_job\(uuid, text, bigint, uuid, text, text, text, text, text, timestamptz, text\)[\s\S]*?from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.upsert_pending_system_reminder_job\(uuid, text, bigint, uuid, text, text, text, text, text, timestamptz, text\)[\s\S]*?to service_role/i,
    );
  });

  it("locks the notification_rules row FIRST, before ever touching notification_jobs -- the same lock update_system_rule_and_invalidate_pending_jobs takes, closing the race by lock ordering", () => {
    const fnBlock = sql.match(/create or replace function public\.upsert_pending_system_reminder_job[\s\S]*?\$\$;/);
    expect(fnBlock).not.toBeNull();
    const lockIndex = fnBlock![0].indexOf("select * into rule_row from public.notification_rules where id = p_rule_id for update;");
    const insertIndex = fnBlock![0].indexOf("insert into public.notification_jobs");
    expect(lockIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(lockIndex);
  });

  it("requires kind = 'system', system_key = p_category, enabled, AND the exact expected revision -- any mismatch is a documented no-op, never an exception", () => {
    expect(sql).toMatch(/rule_row\.kind is distinct from 'system'/);
    expect(sql).toMatch(/rule_row\.system_key is distinct from p_category/);
    expect(sql).toMatch(/rule_row\.enabled is not true/);
    expect(sql).toMatch(/rule_row\.revision is distinct from p_expected_revision/);
    expect(sql).toMatch(/return false; -- stale config \/ disabled \/ mismatched -- documented no-op/);
  });

  it("reuses the SAME pending-only on-conflict-do-update-where-pending semantics upsert_pending_reminder_job already uses -- never revives a claimed/completed/failed/skipped/cancelled job", () => {
    const fnBlock = sql.match(/create or replace function public\.upsert_pending_system_reminder_job[\s\S]*?\$\$;/);
    expect(fnBlock).not.toBeNull();
    expect(fnBlock![0]).toMatch(/on conflict \(dedupe_key\) do update set/);
    expect(fnBlock![0]).toMatch(/where public\.notification_jobs\.status = 'pending';/);
    expect(fnBlock![0]).not.toMatch(/status = excluded\.status/); // status is never part of the SET list
  });

  it("returns true only once authorized and the write is attempted, false for every stale/disabled/mismatched case", () => {
    expect(sql).toMatch(/returns boolean/);
    expect(sql).toMatch(/return true;\s*\n\s*end;/);
  });
});
