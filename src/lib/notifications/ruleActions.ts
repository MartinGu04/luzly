"use server";

import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { describeSystemRule, formatNextWeeklyOccurrence, formatWeeklyRecurringSchedule } from "@/lib/presentation/notificationRules";
import { loadManagerPersonnelContext, loadManagerWorkbookContext } from "@/lib/readModels/managerWorkbookContext";
import { validateAudienceCardinality, validateText, resolveAudience, type BroadcastAudienceKind } from "./engine/manualBroadcast";
import { BROADCAST_BODY_MAX_LENGTH, BROADCAST_TITLE_MAX_LENGTH } from "./manualBroadcastLimits";
import {
  archiveCustomWeeklyRule,
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

/**
 * The ONLY fields a manager may ever change on a system rule --
 * enabled/disabled and its local send time. Never `title`/`body`/
 * `audienceKind`/`weekday`/`system_key`/`kind` -- those aren't even
 * accepted as input here, and the store layer's own `updateSystemRule`
 * only ever writes these two fields plus audit metadata (see that
 * function's own docstring; the migration's identity-protection trigger
 * is the final backstop underneath that).
 */
export async function updateSystemRuleAction(
  id: string,
  input: { enabled: boolean; localHour: number; localMinute: number },
): Promise<UpdateSystemRuleActionResult> {
  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "invalid_request" };
  if (typeof input.enabled !== "boolean") return { ok: false, error: "invalid_request" };
  if (!isValidClockTime(input.localHour, input.localMinute)) return { ok: false, error: "invalid_schedule" };

  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const updated = await updateSystemRule(id, {
    enabled: input.enabled,
    localHour: input.localHour,
    localMinute: input.localMinute,
    updatedByPersonId: contextResult.context.manager.id,
    updatedByPersonName: contextResult.context.manager.name,
  });
  if (!updated) return { ok: false, error: "not_found" };

  const view = toSystemRuleView(updated);
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
  /** Untrusted candidate roster ids -- re-validated against the freshly-fetched roster before anything is saved (see `resolveAudience`). */
  targetPersonIds: string[];
}

export type CustomWeeklyRuleActionResult = { ok: true; rule: CustomWeeklyRuleView } | { ok: false; error: string };

function isValidWeekday(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6;
}

function validateCustomWeeklyRuleFields(
  input: CustomWeeklyRuleActionInput,
  people: readonly import("@/lib/domain/types").Person[],
): { ok: true; title: string; body: string; canonicalTargetPersonIds: string[] } | { ok: false; error: string } {
  const title = validateText(input.title, BROADCAST_TITLE_MAX_LENGTH);
  if (title === null) return { ok: false, error: "invalid_title" };

  const body = validateText(input.body, BROADCAST_BODY_MAX_LENGTH);
  if (body === null) return { ok: false, error: "invalid_body" };

  if (!isValidWeekday(input.weekday)) return { ok: false, error: "invalid_weekday" };
  if (!isValidClockTime(input.localHour, input.localMinute)) return { ok: false, error: "invalid_schedule" };

  if (!Array.isArray(input.targetPersonIds) || !input.targetPersonIds.every((id) => typeof id === "string")) {
    return { ok: false, error: "invalid_targets" };
  }
  if (!validateAudienceCardinality(input.audienceKind, input.targetPersonIds)) {
    return { ok: false, error: "invalid_audience" };
  }

  const targets = resolveAudience(input.audienceKind, people, input.targetPersonIds);
  if (targets === null) return { ok: false, error: "invalid_targets" };
  if (targets.length === 0) return { ok: false, error: "no_targets" };

  const canonicalTargetPersonIds = [...new Set(targets.map((person) => person.id))];
  return { ok: true, title, body, canonicalTargetPersonIds };
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
