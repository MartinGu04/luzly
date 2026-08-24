import "server-only";
import { listActiveNotificationRules, type BroadcastAudienceKind, type NotificationRuleRow } from "./store";

/**
 * Every existing fixed reminder category, as a closed union -- the exact
 * same strings `reminders.ts` already uses as `notification_jobs.category`/
 * dedupe-key prefixes, now doubling as `notification_rules.system_key`.
 * Kept here (not re-exported from `reminders.ts`) so this module has no
 * dependency on the reminder engine itself -- `reminders.ts` imports
 * FROM here, never the other way around.
 */
export type SystemRuleKey =
  | "tomorrow_shift"
  | "tomorrow_duty"
  | "tomorrow_logistics_withdrawal"
  | "tomorrow_logistics_withdrawal_supervisor"
  | "logistics_withdrawal_noon_assigned"
  | "logistics_withdrawal_noon_supervisor"
  | "logistics_withdrawal_noon_team"
  | "almash_check_in"
  | "constraints_sunday"
  | "constraints_monday";

const SYSTEM_RULE_KEYS: ReadonlySet<string> = new Set<SystemRuleKey>([
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
]);

export interface SystemRuleConfig {
  id: string;
  systemKey: SystemRuleKey;
  enabled: boolean;
  localHour: number;
  localMinute: number;
  /**
   * Monotonic, server-incremented on every manager edit
   * (`updateSystemRule`) -- the reminder engine's own stale-config guard.
   * A worker that loaded this config BEFORE a manager's concurrent
   * enable/disable/time-edit commits must never be able to materialize a
   * `notification_jobs` row under the OLD configuration once that edit
   * has committed; every write into a system category's pending job goes
   * through `upsertPendingSystemReminderJob`, which re-validates this
   * EXACT revision against the (locked) live `notification_rules` row at
   * write time and no-ops if it no longer matches. See that function's
   * own docstring and the migration's `upsert_pending_system_reminder_job`
   * for the full race this closes.
   */
  revision: number;
}

export interface CustomWeeklyRuleConfig {
  id: string;
  enabled: boolean;
  /** 0=Sunday..6=Saturday, matching `lib/domain/dutyBlocks.ts`'s own `dayOfWeek`. */
  weekday: number;
  localHour: number;
  localMinute: number;
  title: string;
  body: string;
  audienceKind: BroadcastAudienceKind;
  targetPersonIds: readonly string[];
  /** The manager who authored this rule -- attributed on each dispatched occurrence's own `manager_notification_batches` row, exactly like a scheduled broadcast attributes its original creator. */
  createdByPersonId: string | null;
  createdByPersonName: string | null;
}

/**
 * The reminder engine's own typed view of `notification_rules` -- loaded
 * ONCE per worker tick (`pipeline.ts`/`scheduledWorker.ts`) and passed
 * down, never re-queried per reminder/person (spec: "Do not query
 * Supabase once per reminder/person"). `systemRules` is keyed by
 * `SystemRuleKey` so a lookup (`ruleConfig.systemRules.get("tomorrow_shift")`)
 * can never typo a category string that doesn't exist.
 */
export interface NotificationRuleConfig {
  systemRules: ReadonlyMap<SystemRuleKey, SystemRuleConfig>;
  customWeeklyRules: readonly CustomWeeklyRuleConfig[];
}

function isSystemRuleKey(value: string | null): value is SystemRuleKey {
  return value !== null && SYSTEM_RULE_KEYS.has(value);
}

function toSystemRuleConfig(row: NotificationRuleRow): SystemRuleConfig | null {
  if (!isSystemRuleKey(row.systemKey)) return null; // unreachable for a genuine 'system' row -- see the migration's own shape check
  return {
    id: row.id,
    systemKey: row.systemKey,
    enabled: row.enabled,
    localHour: row.localHour,
    localMinute: row.localMinute,
    revision: row.revision,
  };
}

function toCustomWeeklyRuleConfig(row: NotificationRuleRow): CustomWeeklyRuleConfig | null {
  if (row.weekday === null || row.title === null || row.body === null || row.audienceKind === null) return null; // unreachable for a genuine 'custom_weekly' row
  return {
    id: row.id,
    enabled: row.enabled,
    weekday: row.weekday,
    localHour: row.localHour,
    localMinute: row.localMinute,
    title: row.title,
    body: row.body,
    audienceKind: row.audienceKind,
    targetPersonIds: row.targetPersonIds,
    createdByPersonId: row.createdByPersonId,
    createdByPersonName: row.createdByPersonName,
  };
}

/**
 * Loads every active (non-archived) rule ONCE and shapes it into the
 * typed `NotificationRuleConfig` the reminder engine / recurring-rule
 * dispatch consume. Throws (never silently falls back to a default/
 * hardcoded config) on any Supabase error -- per the feature's own
 * "fail safely" requirement: if persisted configuration cannot be
 * loaded, the caller must NOT send anything a manager may have disabled,
 * so this deliberately propagates the failure rather than swallowing it.
 * See `pipeline.ts`/`scheduledWorker.ts` for how each worker isolates
 * this failure from its OTHER, independent phases.
 */
export async function loadNotificationRuleConfig(): Promise<NotificationRuleConfig> {
  const rows = await listActiveNotificationRules();

  const systemRules = new Map<SystemRuleKey, SystemRuleConfig>();
  const customWeeklyRules: CustomWeeklyRuleConfig[] = [];

  for (const row of rows) {
    if (row.kind === "system") {
      const config = toSystemRuleConfig(row);
      if (config) systemRules.set(config.systemKey, config);
    } else {
      const config = toCustomWeeklyRuleConfig(row);
      if (config) customWeeklyRules.push(config);
    }
  }

  return { systemRules, customWeeklyRules };
}
