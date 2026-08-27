import "server-only";
import type { Person } from "@/lib/domain/types";
import type { AudienceGroupable, AudienceGroupKey } from "@/lib/domain/audienceGroups";
import { personMatchesAudienceSelection, type NotificationAudienceSelection } from "@/lib/domain/audienceSelection";
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
  /** `null` = use the built-in title unchanged. See `applySystemRuleCopy` (`systemRuleCopy.ts`). */
  titleOverride: string | null;
  /** `null` = use the built-in body unchanged. For a `dynamic_details_required` category (see the presentation-layer catalog), a non-null value is a `{details}` template -- already validated server-side at save time, never re-validated here. */
  bodyOverride: string | null;
  /**
   * A FILTER over this rule's own domain-eligible recipients -- see
   * `isSystemRulePersonAllowed` below. Can never expand who is eligible.
   * `"groups"` (dynamic audience groups/exclusions follow-up) resolves
   * `audienceGroupKeys` fresh against the CURRENT roster every tick --
   * never a frozen list of person ids -- via the shared
   * `lib/domain/audienceSelection.ts` resolver.
   */
  audienceMode: "all_eligible" | "selected" | "groups";
  /** Stable roster person ids -- meaningful only when `audienceMode === 'selected'`. Re-validated against the CURRENT roster at send time by each reminder function's own recipient resolution (a stale/removed id simply never matches a currently-eligible person, so it's silently skipped, never guessed at). */
  targetPersonIds: readonly string[];
  /** Dynamic audience group keys -- meaningful only when `audienceMode === 'groups'`. Resolved fresh against the current roster every tick, never persisted as a frozen id list (spec: "Groups must be resolved dynamically... not persisted as a frozen list"). */
  audienceGroupKeys: readonly AudienceGroupKey[];
  /**
   * "לא לשלוח ל" -- stable roster person ids explicitly EXCLUDED from this
   * rule, independent of `audienceMode`. Always applied, always wins --
   * see `isSystemRulePersonAllowed` below and
   * `lib/domain/audienceSelection.ts`'s own docstring. Never has any power
   * to ADD a recipient; only to remove one who would otherwise qualify.
   */
  excludedPersonIds: readonly string[];
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
    titleOverride: row.systemTitleOverride,
    bodyOverride: row.systemBodyOverride,
    audienceMode: row.systemAudienceMode,
    targetPersonIds: row.systemTargetPersonIds,
    audienceGroupKeys: row.systemAudienceGroupKeys,
    excludedPersonIds: row.systemExcludedPersonIds,
  };
}

/** `SystemRuleConfig`'s own audience configuration, translated into the shared resolver's `NotificationAudienceSelection` shape -- `'selected'` maps to the resolver's `'people'` mode (same meaning, different historical name kept for API/DB backwards compatibility -- see this table's own migration). */
function systemRuleAudienceSelection(rule: SystemRuleConfig): NotificationAudienceSelection {
  return {
    mode: rule.audienceMode === "selected" ? "people" : rule.audienceMode,
    groupKeys: rule.audienceGroupKeys,
    personIds: rule.targetPersonIds,
    excludedPersonIds: rule.excludedPersonIds,
  };
}

/**
 * Whether `personId` is allowed to receive `rule`'s notification, per the
 * manager's own audience configuration -- a pure FILTER over whatever the
 * caller's own domain eligibility logic already decided; this function
 * has no domain knowledge itself and must always be applied ON TOP of
 * (never instead of) a category's real eligible-recipient computation
 * (see each `reminders.ts` function's own recipient loop). Delegates to
 * the ONE shared `lib/domain/audienceSelection.ts` resolver -- never a
 * second copy of the mode/group/exclusion logic -- so the same rules
 * (exclusions always win, groups resolved fresh from the person's own
 * current fields, `'selected'`/`'groups'` with nothing selected allows no
 * one rather than silently falling back to `'all_eligible'`) apply
 * identically here and in every other audience-selecting surface.
 *
 * `people` is consulted ONLY to resolve `personId`'s
 * `personnelType`/`isSupervisor`/`isTechnician` for a `'groups'`-mode
 * rule -- `'all_eligible'` never needs it, and `'selected'`/exclusions
 * only ever compare bare ids. A `personId` genuinely absent from `people`
 * (should be unreachable for a genuine roster-derived id, but every
 * caller here passes the SAME roster snapshot it resolved `personId` from
 * in the first place) falls back to an "unclassified, no capability
 * flags" shell -- which can never satisfy any `'groups'` membership check
 * (fail closed), while leaving `'all_eligible'`/`'selected'`/exclusion
 * decisions, which only ever need the bare id, completely unaffected.
 */
export function isSystemRulePersonAllowed(rule: SystemRuleConfig, personId: string, people: readonly Person[]): boolean {
  const person = people.find((candidate) => candidate.id === personId);
  const groupable: AudienceGroupable = person ?? { id: personId, personnelType: null, isSupervisor: false, isTechnician: false };
  return personMatchesAudienceSelection(groupable, systemRuleAudienceSelection(rule));
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
