"use server";

import { resolveCurrentPerson } from "@/lib/auth/resolveCurrentPerson";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import {
  cancelManagerConfirmationRequiredJob,
  notifyPeopleScheduledForRange,
  notifySelfReportDecision,
  scheduleManagerConfirmationRequiredJob,
} from "@/lib/notifications/engine/shootingRanges";
import { loadManagerPersonnelContext } from "@/lib/readModels/managerWorkbookContext";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import {
  createPlannedOccurrences,
  getPlannedOccurrencesByDate,
  insertApprovedCompletion,
  insertRejectedPlannedCompletion,
  insertSelfReport,
  resolvePlannedOccurrencesForDate,
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
 */
export async function submitSelfReportShootingRangeAction(
  performedOn: string,
  notes: string | null,
): Promise<ShootingRangeActionResult> {
  const identity = await resolveCurrentPerson();
  if (identity.status !== "ok") return { ok: false, error: identity.status };

  const parsedDate = parseCalendarDate(performedOn);
  if (!parsedDate) return { ok: false, error: "invalid_date" };

  const today = getJerusalemLocalNow().date;
  if (performedOn > today) return { ok: false, error: "date_in_future" };

  const cleanNotes = validateNotes(notes);
  if (cleanNotes === "invalid") return { ok: false, error: "invalid_notes" };

  await insertSelfReport({
    personId: identity.person.id,
    performedOn,
    notes: cleanNotes,
    submittedByPersonId: identity.person.id,
    submittedByPersonName: identity.person.name,
  });

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

  const rosterIds = new Set(people.map((person) => person.id));
  const validPersonIds = [...new Set(personIds)].filter((id) => rosterIds.has(id));
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
 * `confirmedPersonIds` is re-validated against the ACTUAL current planned
 * roster for `rangeDate` (fetched fresh, never trusted from the client) --
 * an id for a person not genuinely scheduled for this date is silently
 * ignored, never able to fabricate a baseline update for an unscheduled
 * person.
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
  const previouslyPlannedIds = beforeOccurrences
    .filter((occurrence) => occurrence.status === "planned")
    .map((occurrence) => occurrence.personId);
  if (previouslyPlannedIds.length === 0) return { ok: false, error: "no_pending_occurrence" };

  const previouslyPlannedSet = new Set(previouslyPlannedIds);
  const confirmedIds = [...new Set(confirmedPersonIds)].filter((id) => previouslyPlannedSet.has(id));
  const rejectedIds = previouslyPlannedIds.filter((id) => !confirmedIds.includes(id));

  await resolvePlannedOccurrencesForDate(rangeDate, confirmedIds, manager.id, manager.name);

  await Promise.all([
    ...confirmedIds.map((personId) =>
      insertApprovedCompletion({
        personId,
        performedOn: rangeDate,
        source: "planned_range_confirmation",
        submittedByPersonId: manager.id,
        submittedByPersonName: manager.name,
        approvedByPersonId: manager.id,
        approvedByPersonName: manager.name,
        linkedPlannedDate: rangeDate,
      }),
    ),
    ...rejectedIds.map((personId) =>
      insertRejectedPlannedCompletion({
        personId,
        performedOn: rangeDate,
        submittedByPersonId: manager.id,
        submittedByPersonName: manager.name,
        approvedByPersonId: manager.id,
        approvedByPersonName: manager.name,
      }),
    ),
  ]);

  await cancelManagerConfirmationRequiredJob(people, rangeDate);

  return { ok: true, confirmedCount: confirmedIds.length, rejectedCount: rejectedIds.length };
}
