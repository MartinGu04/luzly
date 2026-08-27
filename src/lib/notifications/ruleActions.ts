"use server";

import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { isAudienceGroupKey, type AudienceGroupKey } from "@/lib/domain/audienceGroups";
import {
  describeSystemRule,
  formatNextWeeklyOccurrence,
  formatWeeklyRecurringSchedule,
  SYSTEM_RULE_DETAILS_PLACEHOLDER,
  type SystemRuleBodyKind,
} from "@/lib/presentation/notificationRules";
import { loadManagerPersonnelContext, loadManagerWorkbookContext } from "@/lib/readModels/managerWorkbookContext";
import { validateAudienceCardinality, validateText, resolveAudience, type BroadcastAudienceKind } from "./engine/manualBroadcast";
import { BROADCAST_BODY_MAX_LENGTH, BROADCAST_TITLE_MAX_LENGTH } from "./manualBroadcastLimits";
import {
  archiveCustomWeeklyRule,
  getNotificationRuleById,
  insertCustomWeeklyRule,
  listActiveNotificationRules,
  setCustomWeeklyRuleEnabled,
  updateCustomWeeklyRule,
  updateSystemRule,
  type NotificationRuleRow,
} from "./engine/store";

// ---------------------------------------------------------------------------
// View shapes -- the ONE thing the Manager UI ever consumes. Internal
// category keys are exposed only as a small secondary diagnostic field,
// never the primary label (spec: "Do not show internal category keys as
// the primary UI").
// ---------------------------------------------------------------------------

export interface SystemRuleView {
  kind: "system";
  id: string;
  systemKey: string;
  enabled: boolean;
  localHour: number;
  localMinute: number;
  name: string;
  trigger: string;
  audience: string;
  copyNote: string;
  revision: number;
  /** `null` = the built-in title is currently in effect. */
  titleOverride: string | null;
  /** `null` = the built-in body is currently in effect. For a `dynamic_details_required` category, a non-null value is the manager's own `{details}` template. */
  bodyOverride: string | null;
  audienceMode: "all_eligible" | "selected" | "groups";
  targetPersonIds: string[];
  /** Dynamic audience group keys -- meaningful only when `audienceMode === "groups"`. Resolved fresh against the current roster every reminder tick, never a frozen id list. */
  audienceGroupKeys: AudienceGroupKey[];
  /** "לא לשלוח ל" -- ALWAYS applied, independent of `audienceMode`. */
  excludedPersonIds: string[];
  /** Whether `bodyOverride` (when set) must contain `{details}` -- from the one authoritative catalog (`describeSystemRule`), never re-derived. */
  bodyKind: SystemRuleBodyKind;
  defaultTitle: string;
  /** Only meaningful when `bodyKind === "static_editable"`. */
  defaultBody: string | null;
  audienceFilterNote: string;
}

export interface CustomWeeklyRuleView {
  kind: "custom_weekly";
  id: string;
  enabled: boolean;
  weekday: number;
  localHour: number;
  localMinute: number;
  title: string;
  body: string;
  audienceKind: BroadcastAudienceKind;
  targetPersonIds: string[];
  /** Dynamic audience group keys -- meaningful only when `audienceKind === "groups"`. Display/re-edit intent only -- `targetPersonIds` is the already-resolved snapshot dispatch actually uses (frozen at save/edit time, exactly like `"everyone"`). */
  audienceGroupKeys: AudienceGroupKey[];
  /** "לא לשלוח ל" intent -- already baked into `targetPersonIds` at save time. */
  excludedPersonIds: string[];
  /** "כל יום שבת בשעה 21:00" -- pure presentation, never re-derived client-side. */
  scheduleSummary: string | null;
  /** The next real Asia/Jerusalem occurrence moment, computed server-side against `now` -- null only if the stored weekday is somehow invalid. */
  nextSendSummary: string | null;
  createdByPersonName: string | null;
}

function toSystemRuleView(row: NotificationRuleRow): SystemRuleView | null {
  if (row.systemKey === null) return null; // unreachable for a genuine 'system' row
  const description = describeSystemRule(row.systemKey);
  return {
    kind: "system",
    id: row.id,
    systemKey: row.systemKey,
    enabled: row.enabled,
    localHour: row.localHour,
    localMinute: row.localMinute,
    name: description.name,
    trigger: description.trigger,
    audience: description.audience,
    copyNote: description.copyNote,
    revision: row.revision,
    titleOverride: row.systemTitleOverride,
    bodyOverride: row.systemBodyOverride,
    audienceMode: row.systemAudienceMode,
    targetPersonIds: row.systemTargetPersonIds,
    audienceGroupKeys: row.systemAudienceGroupKeys,
    excludedPersonIds: row.systemExcludedPersonIds,
    bodyKind: description.bodyKind,
    defaultTitle: description.defaultTitle,
    defaultBody: description.defaultBody,
    audienceFilterNote: description.audienceFilterNote,
  };
}

function toCustomWeeklyRuleView(row: NotificationRuleRow, now: ReturnType<typeof getJerusalemLocalNow>): CustomWeeklyRuleView | null {
  if (row.weekday === null || row.title === null || row.body === null || row.audienceKind === null) return null; // unreachable for a genuine 'custom_weekly' row
  return {
    kind: "custom_weekly",
    id: row.id,
    enabled: row.enabled,
    weekday: row.weekday,
    localHour: row.localHour,
    localMinute: row.localMinute,
    title: row.title,
    body: row.body,
    audienceKind: row.audienceKind,
    targetPersonIds: row.targetPersonIds,
    audienceGroupKeys: row.audienceGroupKeys,
    excludedPersonIds: row.excludedPersonIds,
    scheduleSummary: formatWeeklyRecurringSchedule(row.weekday, row.localHour * 60 + row.localMinute),
    nextSendSummary: row.enabled ? formatNextWeeklyOccurrence(row.weekday, row.localHour * 60 + row.localMinute, now) : null,
    createdByPersonName: row.createdByPersonName,
  };
}

export type ListNotificationRulesResult =
  | { ok: true; systemRules: SystemRuleView[]; customWeeklyRules: CustomWeeklyRuleView[] }
  | { ok: false; error: string };

/**
 * The Fixed Notifications Center's own listing -- manager-gated via the
 * SAME lightweight `loadManagerPersonnelContext` boundary the existing
 * scheduled/recent-broadcast polls use (this action needs nothing from
 * Schedule/Settings/Potential). Every list/create/edit/enable/disable/
 * archive action in this file re-derives manager authorization
 * independently -- never trusts a cached client-side check.
 */
export async function listNotificationRulesAction(): Promise<ListNotificationRulesResult> {
  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const now = getJerusalemLocalNow();
  const rows = await listActiveNotificationRules();

  const systemRules: SystemRuleView[] = [];
  const customWeeklyRules: CustomWeeklyRuleView[] = [];
  for (const row of rows) {
    if (row.kind === "system") {
      const view = toSystemRuleView(row);
      if (view) systemRules.push(view);
    } else {
      const view = toCustomWeeklyRuleView(row, now);
      if (view) customWeeklyRules.push(view);
    }
  }

  return { ok: true, systemRules, customWeeklyRules };
}

export type UpdateSystemRuleActionResult = { ok: true; rule: SystemRuleView } | { ok: false; error: string };

function isValidClockTime(hour: unknown, minute: unknown): hour is number {
  return Number.isInteger(hour) && (hour as number) >= 0 && (hour as number) <= 23 && Number.isInteger(minute) && (minute as number) >= 0 && (minute as number) <= 59;
}

/** `null` in, `null` out (reset to built-in). A blank/whitespace-only string is ALSO treated as a reset -- the same "reset to default" action the UI's own explicit button performs, just reachable by clearing the field. Too-long text is rejected. */
function normalizeSystemCopyOverride(value: unknown, maxLength: number): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > maxLength) return { ok: false };
  return { ok: true, value: trimmed };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) {
    count++;
  }
  return count;
}

export interface UpdateSystemRuleActionInput {
  enabled: boolean;
  localHour: number;
  localMinute: number;
  /** `null`, or a blank string, resets to the built-in title. */
  titleOverride: string | null;
  /** `null`, or a blank string, resets to the built-in body. For a `dynamic_details_required` category (`describeSystemRule`), a non-null value MUST contain exactly one `{details}` -- validated here server-side against the rule's OWN current classification, never trusted from the client. */
  bodyOverride: string | null;
  audienceMode: "all_eligible" | "selected" | "groups";
  /** Untrusted candidate roster ids -- re-validated against the freshly-fetched roster before anything is saved (never Supabase auth ids). Ignored (forced to `[]`) when `audienceMode` is not `"selected"`. */
  targetPersonIds: string[];
  /** Untrusted candidate group keys -- re-validated against the canonical `AudienceGroupKey` enum before anything is saved. Ignored (forced to `[]`) when `audienceMode` is not `"groups"`. Optional/defaults to `[]`. */
  audienceGroupKeys?: string[];
  /** "לא לשלוח ל" -- untrusted candidate roster ids, ALWAYS re-validated against the freshly-fetched roster, independent of `audienceMode`. Optional/defaults to `[]`. */
  excludedPersonIds?: string[];
  /**
   * The `revision` this edit's own caller loaded the rule at
   * (`SystemRuleView.revision`) -- the Manager-edit optimistic
   * concurrency token. If the rule's CURRENT revision no longer matches
   * (someone else saved a change since this page loaded), the whole
   * request is rejected with `"conflict"` rather than silently
   * overwriting that newer edit -- see `store.ts`'s `updateSystemRule`
   * for the full race this closes.
   */
  expectedRevision: number;
}

/**
 * Every field a manager may change on a system rule: enabled/disabled,
 * local send time, an optional title/body override, and an audience
 * FILTER (mode + selected roster person ids) over the rule's own
 * domain-derived eligible recipients. Never `weekday`/`system_key`/`kind`
 * -- those aren't even accepted as input here, and the store layer's own
 * `updateSystemRule` only ever writes the fields listed above plus audit
 * metadata (the migration's identity-protection trigger is the final
 * backstop underneath that). The rule's own trigger/domain-eligibility
 * logic itself is never configurable here -- an audience selection can
 * only narrow who a category's own existing eligibility computation
 * already includes, never replace or expand it (see `reminders.ts`'s
 * `isSystemRulePersonAllowed` call sites).
 *
 * Uses `loadManagerWorkbookContext(["personnel"])` (not the lighter
 * `loadManagerPersonnelContext` this action used before audience
 * filtering existed) -- a `"selected"` audience must be re-validated
 * against a FRESH roster, exactly like `createCustomWeeklyRuleAction`/
 * `updateCustomWeeklyRuleAction` already do for the same reason: a
 * client-supplied person id that isn't a genuine current roster member
 * fails the WHOLE request, never silently dropped.
 *
 * `input.expectedRevision` is an optimistic concurrency token: the
 * revision the UI's own copy of the rule was loaded at. If another
 * Manager's edit has since committed, the rule's current revision no
 * longer matches, and this whole request is rejected with `"conflict"`
 * -- never silently applied over the newer edit. This is what makes even
 * the quick enable/disable toggle safe: it resubmits the FULL rule state
 * (this RPC is full-state), so without this check a stale toggle could
 * silently revert someone else's just-saved copy/audience change. See
 * `store.ts`'s `updateSystemRule` for the full race and the RPC's own
 * migration doc comment for the SQL-level guard.
 */
export async function updateSystemRuleAction(id: string, input: UpdateSystemRuleActionInput): Promise<UpdateSystemRuleActionResult> {
  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "invalid_request" };
  if (typeof input.enabled !== "boolean") return { ok: false, error: "invalid_request" };
  if (!isValidClockTime(input.localHour, input.localMinute)) return { ok: false, error: "invalid_schedule" };
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision <= 0) {
    return { ok: false, error: "invalid_request" };
  }

  const titleResult = normalizeSystemCopyOverride(input.titleOverride, BROADCAST_TITLE_MAX_LENGTH);
  if (!titleResult.ok) return { ok: false, error: "invalid_title" };
  const bodyResult = normalizeSystemCopyOverride(input.bodyOverride, BROADCAST_BODY_MAX_LENGTH);
  if (!bodyResult.ok) return { ok: false, error: "invalid_body" };

  if (input.audienceMode !== "all_eligible" && input.audienceMode !== "selected" && input.audienceMode !== "groups") {
    return { ok: false, error: "invalid_audience" };
  }
  if (!Array.isArray(input.targetPersonIds) || !input.targetPersonIds.every((personId) => typeof personId === "string")) {
    return { ok: false, error: "invalid_targets" };
  }
  if (input.audienceMode === "selected" && input.targetPersonIds.length === 0) {
    return { ok: false, error: "no_targets" };
  }
  const audienceGroupKeysInput = input.audienceGroupKeys ?? [];
  if (!Array.isArray(audienceGroupKeysInput) || !audienceGroupKeysInput.every(isAudienceGroupKey)) {
    return { ok: false, error: "invalid_audience" };
  }
  if (input.audienceMode === "groups" && audienceGroupKeysInput.length === 0) {
    return { ok: false, error: "no_targets" };
  }
  const excludedPersonIdsInput = input.excludedPersonIds ?? [];
  if (!Array.isArray(excludedPersonIdsInput) || !excludedPersonIdsInput.every((personId) => typeof personId === "string")) {
    return { ok: false, error: "invalid_targets" };
  }

  const contextResult = await loadManagerWorkbookContext(["personnel"]);
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };
  const { manager, people } = contextResult.context;

  const existingRow = await getNotificationRuleById(id);
  if (!existingRow || existingRow.kind !== "system" || existingRow.systemKey === null) {
    return { ok: false, error: "not_found" };
  }

  // The `{details}` requirement is checked against THIS rule's OWN
  // classification (the one authoritative catalog, `describeSystemRule`)
  // -- never trusted from the client, and never re-derived anywhere else.
  if (bodyResult.value !== null && describeSystemRule(existingRow.systemKey).bodyKind === "dynamic_details_required") {
    if (countOccurrences(bodyResult.value, SYSTEM_RULE_DETAILS_PLACEHOLDER) !== 1) {
      return { ok: false, error: "invalid_body_details_placeholder" };
    }
  }

  const rosterPersonIds = new Set(people.map((person) => person.id));

  let canonicalTargetPersonIds: string[] = [];
  if (input.audienceMode === "selected") {
    canonicalTargetPersonIds = [...new Set(input.targetPersonIds)];
    if (!canonicalTargetPersonIds.every((personId) => rosterPersonIds.has(personId))) {
      return { ok: false, error: "invalid_targets" };
    }
  }

  const canonicalAudienceGroupKeys: AudienceGroupKey[] = input.audienceMode === "groups" ? [...new Set(audienceGroupKeysInput)] : [];

  // "לא לשלוח ל" -- ALWAYS re-validated against the fresh roster,
  // independent of `audienceMode`, same fail-closed rule as `targetPersonIds`.
  const canonicalExcludedPersonIds = [...new Set(excludedPersonIdsInput)];
  if (!canonicalExcludedPersonIds.every((personId) => rosterPersonIds.has(personId))) {
    return { ok: false, error: "invalid_targets" };
  }

  const outcome = await updateSystemRule(id, {
    enabled: input.enabled,
    localHour: input.localHour,
    localMinute: input.localMinute,
    titleOverride: titleResult.value,
    bodyOverride: bodyResult.value,
    audienceMode: input.audienceMode,
    targetPersonIds: canonicalTargetPersonIds,
    audienceGroupKeys: canonicalAudienceGroupKeys,
    excludedPersonIds: canonicalExcludedPersonIds,
    expectedRevision: input.expectedRevision,
    updatedByPersonId: manager.id,
    updatedByPersonName: manager.name,
  });
  if (outcome.status === "not_found") return { ok: false, error: "not_found" };
  if (outcome.status === "conflict") return { ok: false, error: "conflict" };

  const view = toSystemRuleView(outcome.rule);
  if (!view) return { ok: false, error: "not_found" };
  return { ok: true, rule: view };
}

export interface CustomWeeklyRuleActionInput {
  title: string;
  body: string;
  /** 0=Sunday..6=Saturday. */
  weekday: number;
  localHour: number;
  localMinute: number;
  audienceKind: BroadcastAudienceKind;
  /** Untrusted candidate roster ids -- re-validated against the freshly-fetched roster before anything is saved (see `resolveAudience`). Ignored unless `audienceKind` is `"person"`/`"people"`. */
  targetPersonIds: string[];
  /** Untrusted candidate group keys -- re-validated against the canonical `AudienceGroupKey` enum before anything is saved. Ignored unless `audienceKind === "groups"`. Resolved against the CURRENT roster and FROZEN into the saved `targetPersonIds` snapshot at this save/edit instant, exactly like `"everyone"` already is -- see `CustomWeeklyRuleView.audienceGroupKeys`'s own docstring. Optional/defaults to `[]`. */
  groupKeys?: string[];
  /** "לא לשלוח ל" -- untrusted candidate roster ids, ALWAYS re-validated against the freshly-fetched roster and baked into the frozen `targetPersonIds` snapshot, independent of `audienceKind`. Optional/defaults to `[]`. */
  excludedPersonIds?: string[];
}

export type CustomWeeklyRuleActionResult = { ok: true; rule: CustomWeeklyRuleView } | { ok: false; error: string };

function isValidWeekday(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6;
}

function validateCustomWeeklyRuleFields(
  input: CustomWeeklyRuleActionInput,
  people: readonly import("@/lib/domain/types").Person[],
): (
  | { ok: true; title: string; body: string; canonicalTargetPersonIds: string[]; canonicalGroupKeys: AudienceGroupKey[]; canonicalExcludedPersonIds: string[] }
  | { ok: false; error: string }
) {
  const title = validateText(input.title, BROADCAST_TITLE_MAX_LENGTH);
  if (title === null) return { ok: false, error: "invalid_title" };

  const body = validateText(input.body, BROADCAST_BODY_MAX_LENGTH);
  if (body === null) return { ok: false, error: "invalid_body" };

  if (!isValidWeekday(input.weekday)) return { ok: false, error: "invalid_weekday" };
  if (!isValidClockTime(input.localHour, input.localMinute)) return { ok: false, error: "invalid_schedule" };

  if (!Array.isArray(input.targetPersonIds) || !input.targetPersonIds.every((id) => typeof id === "string")) {
    return { ok: false, error: "invalid_targets" };
  }
  const groupKeysInput = input.groupKeys ?? [];
  if (!Array.isArray(groupKeysInput) || !groupKeysInput.every(isAudienceGroupKey)) {
    return { ok: false, error: "invalid_audience" };
  }
  const excludedPersonIdsInput = input.excludedPersonIds ?? [];
  if (!Array.isArray(excludedPersonIdsInput) || !excludedPersonIdsInput.every((id) => typeof id === "string")) {
    return { ok: false, error: "invalid_targets" };
  }
  const canonicalGroupKeys = [...new Set(groupKeysInput)] as AudienceGroupKey[];
  if (!validateAudienceCardinality(input.audienceKind, input.targetPersonIds, canonicalGroupKeys)) {
    return { ok: false, error: "invalid_audience" };
  }

  const rosterPersonIds = new Set(people.map((person) => person.id));
  const canonicalExcludedPersonIds = [...new Set(excludedPersonIdsInput)];
  if (!canonicalExcludedPersonIds.every((id) => rosterPersonIds.has(id))) {
    return { ok: false, error: "invalid_targets" };
  }

  const targets = resolveAudience(input.audienceKind, people, input.targetPersonIds, canonicalGroupKeys, canonicalExcludedPersonIds);
  if (targets === null) return { ok: false, error: "invalid_targets" };
  if (targets.length === 0) return { ok: false, error: "no_targets" };

  const canonicalTargetPersonIds = [...new Set(targets.map((person) => person.id))];
  return { ok: true, title, body, canonicalTargetPersonIds, canonicalGroupKeys, canonicalExcludedPersonIds };
}

/**
 * Creates a new manager-authored weekly recurring rule. Manager-gated via
 * `loadManagerWorkbookContext(["personnel"])` (needs the fresh roster to
 * validate `targetPersonIds` against, same boundary the immediate/
 * scheduled broadcast composers use) -- every candidate id is re-resolved
 * against the FRESH roster server-side; a client-supplied id that doesn't
 * genuinely match a current roster member fails the whole request
 * closed, never silently drops just that id (`resolveAudience`).
 */
export async function createCustomWeeklyRuleAction(input: CustomWeeklyRuleActionInput): Promise<CustomWeeklyRuleActionResult> {
  const contextResult = await loadManagerWorkbookContext(["personnel"]);
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const { manager, people } = contextResult.context;
  const validated = validateCustomWeeklyRuleFields(input, people);
  if (!validated.ok) return validated;

  const row = await insertCustomWeeklyRule({
    weekday: input.weekday,
    localHour: input.localHour,
    localMinute: input.localMinute,
    title: validated.title,
    body: validated.body,
    audienceKind: input.audienceKind,
    targetPersonIds: validated.canonicalTargetPersonIds,
    audienceGroupKeys: validated.canonicalGroupKeys,
    excludedPersonIds: validated.canonicalExcludedPersonIds,
    createdByPersonId: manager.id,
    createdByPersonName: manager.name,
  });

  const view = toCustomWeeklyRuleView(row, getJerusalemLocalNow());
  if (!view) return { ok: false, error: "invalid_request" };
  return { ok: true, rule: view };
}

/** Edits a still-active custom rule -- re-validates everything from scratch, exactly like creation (an intentional audience/schedule/copy change is a fresh, fully re-validated request, same convention as the one-time scheduled broadcast editor). */
export async function updateCustomWeeklyRuleAction(id: string, input: CustomWeeklyRuleActionInput): Promise<CustomWeeklyRuleActionResult> {
  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "invalid_request" };

  const contextResult = await loadManagerWorkbookContext(["personnel"]);
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const { manager, people } = contextResult.context;
  const validated = validateCustomWeeklyRuleFields(input, people);
  if (!validated.ok) return validated;

  const updated = await updateCustomWeeklyRule(id, {
    weekday: input.weekday,
    localHour: input.localHour,
    localMinute: input.localMinute,
    title: validated.title,
    body: validated.body,
    audienceKind: input.audienceKind,
    targetPersonIds: validated.canonicalTargetPersonIds,
    audienceGroupKeys: validated.canonicalGroupKeys,
    excludedPersonIds: validated.canonicalExcludedPersonIds,
    updatedByPersonId: manager.id,
    updatedByPersonName: manager.name,
  });
  if (!updated) return { ok: false, error: "not_found" };

  const view = toCustomWeeklyRuleView(updated, getJerusalemLocalNow());
  if (!view) return { ok: false, error: "not_found" };
  return { ok: true, rule: view };
}

export type SetCustomWeeklyRuleEnabledActionResult = { ok: true; rule: CustomWeeklyRuleView } | { ok: false; error: string };

export async function setCustomWeeklyRuleEnabledAction(id: string, enabled: boolean): Promise<SetCustomWeeklyRuleEnabledActionResult> {
  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "invalid_request" };
  if (typeof enabled !== "boolean") return { ok: false, error: "invalid_request" };

  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const updated = await setCustomWeeklyRuleEnabled(id, enabled, contextResult.context.manager.id, contextResult.context.manager.name);
  if (!updated) return { ok: false, error: "not_found" };

  const view = toCustomWeeklyRuleView(updated, getJerusalemLocalNow());
  if (!view) return { ok: false, error: "not_found" };
  return { ok: true, rule: view };
}

export type ArchiveCustomWeeklyRuleActionResult = { ok: true } | { ok: false; error: string };

/** Terminal -- see `archiveCustomWeeklyRule`'s own docstring for why there is no un-archive path in V1. Historical `notification_jobs`/`manager_notification_batches` rows this rule ever produced are never touched. */
export async function archiveCustomWeeklyRuleAction(id: string): Promise<ArchiveCustomWeeklyRuleActionResult> {
  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "invalid_request" };

  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const archived = await archiveCustomWeeklyRule(id, contextResult.context.manager.id, contextResult.context.manager.name);
  if (!archived) return { ok: false, error: "not_found" };
  return { ok: true };
}
