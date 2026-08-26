"use server";

import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { isEligibleForShootingRanges } from "@/lib/domain/shootingRangeQualification";
import {
  cancelManagerConfirmationRequiredJob,
  notifyManagersOfSelfReportSubmitted,
  notifyPeopleScheduledForRange,
  notifySelfReportDecision,
  scheduleManagerConfirmationRequiredJob,
} from "@/lib/notifications/engine/shootingRanges";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { parseShootingRangeRelevanceSheet } from "@/lib/parsers/shootingRanges";
import { loadManagerPersonnelContext } from "@/lib/readModels/managerWorkbookContext";
import {
  getShootingRangesWorkbookSheet,
  selectRelevanceRecordForPerson,
  SHOOTING_RANGES_REQUIRED_SOURCES,
} from "@/lib/readModels/shootingRangeQualification";
import { getWorkbookSnapshot } from "@/lib/sync";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import {
  confirmShootingRangeOccurrences,
  createPlannedOccurrences,
  getPlannedOccurrencesByDate,
  insertSelfReport,
  resolveSelfReport,
} from "./store";

export type ShootingRangeActionResult = { ok: true } | { ok: false; error: string };

const MAX_NOTES_LENGTH = 500;

function validateNotes(notes: string | null | undefined): string | null | "invalid" {
  if (notes === null || notes === undefined) return null;
  if (typeof notes !== "string") return "invalid";
  const trimmed = notes.trim();
  if (trimmed.length > MAX_NOTES_LENGTH) return "invalid";
  return trimmed || null;
}

/**
 * "ביצעתי מטווח" -- the user reports their own completion. Always inserted
 * as `pending`; never renews the qualification baseline by itself (only a
 * later manager approval, via `approveSelfReportShootingRangeAction`, can).
 * `performedOn` must be a real calendar date that is not in the future --
 * a self-report is a claim about something that already happened.
 *
 * מטווחים is scoped to regular-service (חובה) personnel who are also
 * אחמ"ש or טכנאי (product decision) -- everyone else is completely out of
 * scope for this feature, not merely hidden from the UI. Re-checked here
 * server-side via the canonical `isEligibleForShootingRanges` (composing
 * `classifyPersonnelType`/`isShiftCapable`, never inferred from name/role/
 * text) against the FRESHLY resolved identity -- an ineligible person can
 * never create a self-report, even by calling this action directly.
 *
 * Also re-checked against the "מטווחים" sheet's own `רלוונטיות` value
 * (product decision, same posture as eligibility above): a person whose
 * current sheet row is explicitly `לא רלוונטי` can never create a
 * self-report either, even by calling this action directly -- מטווחים is
 * not currently a qualification concern for them, so there is nothing for
 * a self-report to renew.
 *
 * Once the report is actually persisted, notifies every current manager
 * (`notifyManagersOfSelfReportSubmitted`) that it's waiting for their
 * approval -- called with the row `insertSelfReport` itself returned
 * (never a second read), so a notification is only ever created for a
 * report that genuinely exists. If `insertSelfReport` throws, this
 * function returns before the notification call is ever reached -- same
 * "no notification for a failed write" semantics every other action in
 * this file already has (e.g. `createPlannedShootingRangeAction` only
 * notifies people once `createPlannedOccurrences` has actually
 * succeeded), and the same "let it propagate, no bespoke try/catch"
 * failure posture too -- a notification-layer error is not swallowed here.
 */
export async function submitSelfReportShootingRangeAction(
  performedOn: string,
  notes: string | null,
): Promise<ShootingRangeActionResult> {
  // Fetches personnel + "מטווחים" together (never a second/duplicate
  // personnel-only fetch) and re-resolves identity against this FRESH
  // parse -- same "fetch full context, then verify identity from it"
  // pattern `loadFairnessWorkbookContext`/`loadShootingRangeQualification`
  // already use, needed here because `רלוונטיות` name-resolution must run
  // against the FULL roster (never a singleton list), same fail-closed
  // ambiguity rule as everywhere else in this feature.
  const snapshot = await getWorkbookSnapshot(SHOOTING_RANGES_REQUIRED_SOURCES);
  const people = parsePersonnelSheet(getShootingRangesWorkbookSheet(snapshot, "personnel"));
  const identity = await getAuthenticatedIdentity();
  const identityResult = resolveIdentityAgainstPeople(identity, people);
  if (identityResult.status !== "ok") return { ok: false, error: identityResult.status };
  if (!isEligibleForShootingRanges(identityResult.person)) return { ok: false, error: "not_eligible" };

  const relevanceRecords = parseShootingRangeRelevanceSheet(
    getShootingRangesWorkbookSheet(snapshot, "shootingRanges"),
    people,
  );
  const relevance = selectRelevanceRecordForPerson(relevanceRecords, identityResult.person.id);
  if (relevance?.relevance === "not_relevant") return { ok: false, error: "not_relevant" };

  const parsedDate = parseCalendarDate(performedOn);
  if (!parsedDate) return { ok: false, error: "invalid_date" };

  const today = getJerusalemLocalNow().date;
  if (performedOn > today) return { ok: false, error: "date_in_future" };

  const cleanNotes = validateNotes(notes);
  if (cleanNotes === "invalid") return { ok: false, error: "invalid_notes" };

  const completion = await insertSelfReport({
    personId: identityResult.person.id,
    performedOn,
    notes: cleanNotes,
    submittedByPersonId: identityResult.person.id,
    submittedByPersonName: identityResult.person.name,
  });

  await notifyManagersOfSelfReportSubmitted(people, identityResult.person.name, performedOn, completion.id);

  return { ok: true };
}

async function resolveSelfReportAction(reportId: string, approve: boolean): Promise<ShootingRangeActionResult> {
  if (typeof reportId !== "string" || reportId.length === 0) return { ok: false, error: "invalid_request" };

  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };
  const { manager, people } = contextResult.context;

  const resolved = await resolveSelfReport(reportId, approve ? "approved" : "rejected", manager.id, manager.name);
  if (!resolved) return { ok: false, error: "invalid_or_already_resolved" };

  await notifySelfReportDecision(people, resolved.personId, approve);
  return { ok: true };
}

/** Manager-only: approves a pending self-report, activating it as the person's new VERIFIED baseline. */
export async function approveSelfReportShootingRangeAction(reportId: string): Promise<ShootingRangeActionResult> {
  return resolveSelfReportAction(reportId, true);
}

/** Manager-only: rejects a pending self-report -- never affects the baseline. */
export async function rejectSelfReportShootingRangeAction(reportId: string): Promise<ShootingRangeActionResult> {
  return resolveSelfReportAction(reportId, false);
}

export type CreatePlannedShootingRangeResult =
  | { ok: true; scheduledCount: number }
  | { ok: false; error: string };

/**
 * Manager-only: schedules a set of people for a future (or same-day) range
 * date. `personIds` is re-validated against a FRESHLY fetched roster --
 * only ids that are genuinely current כ"א members ever reach
 * `createPlannedOccurrences`; anything else is silently dropped, never
 * trusted at face value. Triggers the "you're scheduled" notification (+
 * day-before reminder) for each newly/already-scheduled person, and
 * (re-)upserts the end-of-day manager confirmation-required job --
 * idempotent either way, so scheduling more people onto an existing date
 * is always safe to re-call.
 *
 * Also re-validates each id against `isEligibleForShootingRanges(...)`
 * (product decision: מטווחים applies only to regular-service personnel who
 * are also אחמ"ש/טכנאי, see this file's `submitSelfReportShootingRangeAction`
 * docs) -- an ineligible person can never become the target of a planned
 * occurrence, even if their id is somehow submitted (a stale UI, a direct
 * call). Silently dropped from the scheduled set, exactly like a foreign/
 * non-roster id -- never a partial failure of the whole request.
 *
 * Also excludes anyone whose "מטווחים" sheet row is currently explicitly
 * `לא רלוונטי` (product decision, same posture and same silent-drop
 * treatment as the eligibility check above): a manager can no longer
 * schedule a לא רלוונטי person for a range, so they never receive the
 * "you're scheduled" notification/reminder either -- מטווחים is not
 * currently a qualification concern for them.
 */
export async function createPlannedShootingRangeAction(
  rangeDate: string,
  personIds: string[],
): Promise<CreatePlannedShootingRangeResult> {
  if (!parseCalendarDate(rangeDate)) return { ok: false, error: "invalid_date" };
  if (!Array.isArray(personIds) || personIds.length === 0) return { ok: false, error: "no_targets" };

  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };
  const { manager, people } = contextResult.context;

  const shootingRangesSnapshot = await getWorkbookSnapshot(["shootingRanges"]);
  const relevanceRecords = parseShootingRangeRelevanceSheet(
    getShootingRangesWorkbookSheet(shootingRangesSnapshot, "shootingRanges"),
    people,
  );

  const eligibleRosterIds = new Set(
    people
      .filter((person) => isEligibleForShootingRanges(person))
      .filter((person) => selectRelevanceRecordForPerson(relevanceRecords, person.id)?.relevance !== "not_relevant")
      .map((person) => person.id),
  );
  const validPersonIds = [...new Set(personIds)].filter((id) => eligibleRosterIds.has(id));
  if (validPersonIds.length === 0) return { ok: false, error: "invalid_targets" };

  const occurrences = await createPlannedOccurrences(rangeDate, validPersonIds, manager.id, manager.name);
  const plannedCount = occurrences.filter((occurrence) => occurrence.status === "planned").length;

  await Promise.all([
    notifyPeopleScheduledForRange(people, validPersonIds, rangeDate),
    scheduleManagerConfirmationRequiredJob(people, rangeDate, plannedCount),
  ]);

  return { ok: true, scheduledCount: validPersonIds.length };
}

export type ConfirmPlannedShootingRangeResult =
  | { ok: true; confirmedCount: number; rejectedCount: number }
  | { ok: false; error: string };

/**
 * Manager-only bulk confirmation: for `rangeDate`, everyone still
 * `'planned'` who is in `confirmedPersonIds` becomes `'confirmed'` and gets
 * a new approved completion (their new VERIFIED baseline, `performedOn =
 * rangeDate`); everyone else still `'planned'` for that date becomes
 * `'not_completed'` with a matching rejected completion row, never
 * touching their baseline.
 *
 * The status transition AND the resulting `shooting_range_completions`
 * inserts happen in ONE atomic database statement
 * (`confirmShootingRangeOccurrences` -> the `confirm_shooting_range_occurrences`
 * RPC) -- NOT a read-then-write sequence here. That is what makes this
 * safe against two concurrent confirmations of the same occurrence (a
 * double-click, two manager tabs, a retried request): seeing the RPC's own
 * migration file for the exact mechanism. `confirmedPersonIds` is never
 * trusted at face value even so -- the RPC itself only ever resolves rows
 * that are ACTUALLY `'planned'` for `rangeDate`, so a foreign/stale id
 * (whether from a malicious client or a stale UI) structurally cannot
 * fabricate a completion; this is enforced at the database boundary, not
 * only by the `getPlannedOccurrencesByDate` pre-check below (which exists
 * purely to return a friendly `"no_pending_occurrence"` error early, not
 * as the authorization boundary).
 */
export async function confirmPlannedShootingRangeAction(
  rangeDate: string,
  confirmedPersonIds: string[],
): Promise<ConfirmPlannedShootingRangeResult> {
  if (!parseCalendarDate(rangeDate)) return { ok: false, error: "invalid_date" };
  if (!Array.isArray(confirmedPersonIds)) return { ok: false, error: "invalid_request" };

  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };
  const { manager, people } = contextResult.context;

  const beforeOccurrences = await getPlannedOccurrencesByDate(rangeDate);
  const hasPendingOccurrence = beforeOccurrences.some((occurrence) => occurrence.status === "planned");
  if (!hasPendingOccurrence) return { ok: false, error: "no_pending_occurrence" };

  const sanitizedConfirmedIds = [...new Set(confirmedPersonIds.filter((id) => typeof id === "string" && id.length > 0))];

  const { confirmedPersonIds: confirmedIds, rejectedPersonIds: rejectedIds } = await confirmShootingRangeOccurrences(
    rangeDate,
    sanitizedConfirmedIds,
    manager.id,
    manager.name,
  );

  await cancelManagerConfirmationRequiredJob(people, rangeDate);

  return { ok: true, confirmedCount: confirmedIds.length, rejectedCount: rejectedIds.length };
}
