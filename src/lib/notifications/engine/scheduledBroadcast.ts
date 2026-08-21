import "server-only";
import type { Person } from "@/lib/domain/types";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { jerusalemLocalTimeToInstant } from "@/lib/time/jerusalemClock";
import { BROADCAST_BODY_MAX_LENGTH, BROADCAST_TITLE_MAX_LENGTH } from "../manualBroadcastLimits";
import { fetchAllSubscribedUserIds, fetchAllUserIdsByEmail, resolvePersonIdentity, type AuthAccountLookup } from "./recipients";
import {
  isSameLogicalBroadcastRequest,
  MANAGER_BROADCAST_CATEGORY,
  resolveAudience,
  validateAudienceCardinality,
  validateText,
  type BroadcastUnresolvedPerson,
} from "./manualBroadcast";
import {
  cancelManagerScheduledBroadcastIfEditable,
  claimDueManagerScheduledBroadcasts,
  claimManagerScheduledBroadcastNow,
  getManagerNotificationBatchById,
  getManagerScheduledBroadcastById,
  insertManagerNotificationBatchIfAbsent,
  insertManagerScheduledBroadcast,
  insertNotificationJobIfAbsent,
  markManagerScheduledBroadcastDispatched,
  setManagerScheduledBroadcastBatchId,
  updateManagerScheduledBroadcastIfEditable,
  type BroadcastAudienceKind,
  type ManagerScheduledBroadcastRow,
} from "./store";

export type { BroadcastAudienceKind } from "./store";
export type { ManagerScheduledBroadcastRow, ManagerScheduledBroadcastStatus } from "./store";

/**
 * Israel-local civil date + clock time -> a validated future UTC instant,
 * or `null` for anything invalid (bad date, out-of-range hour/minute, or a
 * moment that is not genuinely in the future). Reuses the domain's own
 * calendar-date validation (`parseCalendarDate`) and the codebase's one
 * canonical local-time-to-instant conversion (`jerusalemLocalTimeToInstant`)
 * -- never hand-rolls either.
 */
function resolveValidatedScheduleInstant(dateStr: string, hour: number, minute: number): Date | null {
  if (!parseCalendarDate(dateStr)) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  const instant = jerusalemLocalTimeToInstant(dateStr, hour, minute);
  if (instant.getTime() <= Date.now()) return null;
  return instant;
}

/** Deterministic per-scheduled-broadcast key for its eventual `manager_notification_batches` row -- stable across every worker retry, so a retry can never create a second logical batch (see `dispatchScheduledBroadcast`). */
function scheduledBroadcastIdempotencyKey(scheduledBroadcastId: string): string {
  return `scheduled:${scheduledBroadcastId}`;
}

export type ScheduledBroadcastValidationError =
  | "invalid_title"
  | "invalid_body"
  | "invalid_audience"
  | "invalid_targets"
  | "no_targets"
  | "invalid_schedule";

interface ValidatedScheduledBroadcastFields {
  title: string;
  body: string;
  canonicalTargetPersonIds: string[];
  scheduledForInstant: Date;
}

function validateScheduledBroadcastFields(input: {
  people: readonly Person[];
  audienceKind: BroadcastAudienceKind;
  targetPersonIds: readonly string[];
  title: string;
  body: string;
  scheduledDate: string;
  scheduledHour: number;
  scheduledMinute: number;
}): { ok: true; fields: ValidatedScheduledBroadcastFields } | { ok: false; error: ScheduledBroadcastValidationError } {
  const title = validateText(input.title, BROADCAST_TITLE_MAX_LENGTH);
  if (title === null) return { ok: false, error: "invalid_title" };

  const body = validateText(input.body, BROADCAST_BODY_MAX_LENGTH);
  if (body === null) return { ok: false, error: "invalid_body" };

  if (!validateAudienceCardinality(input.audienceKind, input.targetPersonIds)) {
    return { ok: false, error: "invalid_audience" };
  }

  const targets = resolveAudience(input.audienceKind, input.people, input.targetPersonIds);
  if (targets === null) return { ok: false, error: "invalid_targets" };
  if (targets.length === 0) return { ok: false, error: "no_targets" };

  const scheduledForInstant = resolveValidatedScheduleInstant(input.scheduledDate, input.scheduledHour, input.scheduledMinute);
  if (!scheduledForInstant) return { ok: false, error: "invalid_schedule" };

  const canonicalTargetPersonIds = [...new Set(targets.map((person) => person.id))];

  return { ok: true, fields: { title, body, canonicalTargetPersonIds, scheduledForInstant } };
}

export interface ScheduledBroadcastInput {
  manager: Person;
  /** The full, freshly-parsed personnel roster -- the ONLY source `"everyone"`/`targetPersonIds` are resolved against, exactly like an immediate send (see `resolveAudience`). */
  people: readonly Person[];
  audienceKind: BroadcastAudienceKind;
  targetPersonIds: readonly string[];
  title: string;
  body: string;
  /** Israel-local civil date, "YYYY-MM-DD". */
  scheduledDate: string;
  /** Israel-local clock hour, 0-23. */
  scheduledHour: number;
  /** Israel-local clock minute, 0-59. */
  scheduledMinute: number;
}

export type CreateScheduledBroadcastOutcome =
  | { ok: true; row: ManagerScheduledBroadcastRow }
  | { ok: false; error: ScheduledBroadcastValidationError };

/**
 * Saves a new scheduled broadcast -- deliberately creates NO
 * `notification_jobs` yet (see this module's own file docstring / the
 * migration's doc comment). `"everyone"` is expanded against the fresh
 * roster right now and frozen into `target_person_ids` -- a person added
 * to כ"א afterward can never silently join this schedule.
 */
export async function createScheduledBroadcast(input: ScheduledBroadcastInput): Promise<CreateScheduledBroadcastOutcome> {
  const validated = validateScheduledBroadcastFields(input);
  if (!validated.ok) return validated;

  const row = await insertManagerScheduledBroadcast({
    audienceKind: input.audienceKind,
    targetPersonIds: validated.fields.canonicalTargetPersonIds,
    title: validated.fields.title,
    body: validated.fields.body,
    scheduledFor: validated.fields.scheduledForInstant.toISOString(),
    createdByPersonId: input.manager.id,
    createdByPersonName: input.manager.name,
  });

  return { ok: true, row };
}

export type EditScheduledBroadcastOutcome =
  | { ok: true; row: ManagerScheduledBroadcastRow }
  | { ok: false; error: ScheduledBroadcastValidationError | "not_found" | "already_started" | "already_cancelled" };

/**
 * Edits a still-`'scheduled'` broadcast -- re-validates and re-resolves
 * everything from scratch (same as `createScheduledBroadcast`), including
 * a fresh `"everyone"` expansion if that's still the chosen audience kind
 * (spec: "selecting/saving 'everyone' again during an edit intentionally
 * refreshes the snapshot to the roster at THAT edit time"). The actual
 * write is guarded at the database level to `status = 'scheduled'`
 * (`updateManagerScheduledBroadcastIfEditable`) -- a `null` result means
 * dispatch already claimed (or cancelled) it between the manager opening
 * the editor and submitting, reported truthfully rather than silently
 * discarded.
 */
export async function editScheduledBroadcast(
  id: string,
  input: ScheduledBroadcastInput,
): Promise<EditScheduledBroadcastOutcome> {
  const validated = validateScheduledBroadcastFields(input);
  if (!validated.ok) return validated;

  const edited = await updateManagerScheduledBroadcastIfEditable(id, {
    audienceKind: input.audienceKind,
    targetPersonIds: validated.fields.canonicalTargetPersonIds,
    title: validated.fields.title,
    body: validated.fields.body,
    scheduledFor: validated.fields.scheduledForInstant.toISOString(),
    changedByPersonId: input.manager.id,
    changedByPersonName: input.manager.name,
  });

  if (edited === null) return await notEditableError(id);
  return { ok: true, row: edited };
}

export type CancelScheduledBroadcastOutcome =
  | { ok: true }
  | { ok: false; error: "not_found" | "already_started" | "already_cancelled" };

/** Cancellation, guarded the same way as edit -- a `'claimed'`/`'dispatched'` broadcast fails truthfully instead of silently no-op'ing. */
export async function cancelScheduledBroadcast(id: string, manager: Person): Promise<CancelScheduledBroadcastOutcome> {
  const cancelled = await cancelManagerScheduledBroadcastIfEditable(id, manager.id, manager.name);
  if (cancelled === null) return await notEditableError(id);
  return { ok: true };
}

async function notEditableError(
  id: string,
): Promise<{ ok: false; error: "not_found" | "already_started" | "already_cancelled" }> {
  const current = await getManagerScheduledBroadcastById(id);
  if (!current) return { ok: false, error: "not_found" };
  if (current.status === "cancelled") return { ok: false, error: "already_cancelled" };
  return { ok: false, error: "already_started" };
}

interface ScheduledDispatchResolution {
  pushCapable: { personId: string; userId: string }[];
  inboxOnly: { personId: string; userId: string }[];
  unresolved: BroadcastUnresolvedPerson[];
}

/**
 * DISPATCH-time recipient resolution -- deliberately NOT `resolveAudience`.
 * The stored `targetPersonIds` snapshot is never re-validated against
 * roster membership as a whole: a person no longer in the (freshly
 * re-fetched) roster becomes individually `"no_longer_in_roster"`-
 * unresolved, never a reason to fail/shrink the rest of the send (spec:
 * "a person removed from / no longer resolvable in the roster may fail
 * resolution at dispatch, but no new person may replace them" -- only the
 * FROZEN id list is ever consulted, so no replacement can occur either
 * way). A person who WAS already in the snapshot and has since become
 * auth-resolvable (new login, fixed email) is correctly picked up here,
 * since identity resolution itself always runs fresh.
 */
function resolveScheduledDispatchTargets(
  storedPersonIds: readonly string[],
  people: readonly Person[],
  emailToAccount: ReadonlyMap<string, AuthAccountLookup>,
  subscribed: ReadonlySet<string>,
): ScheduledDispatchResolution {
  const byId = new Map(people.map((person) => [person.id, person]));
  const pushCapable: { personId: string; userId: string }[] = [];
  const inboxOnly: { personId: string; userId: string }[] = [];
  const unresolved: BroadcastUnresolvedPerson[] = [];

  for (const personId of storedPersonIds) {
    const person = byId.get(personId);
    if (!person) {
      unresolved.push({ personId, personName: personId, reason: "no_longer_in_roster" });
      continue;
    }

    const identity = resolvePersonIdentity(person, people, emailToAccount);
    if (identity.status === "no_email" || identity.status === "not_found") {
      unresolved.push({ personId: person.id, personName: person.name, reason: "missing_email" });
      continue;
    }
    if (identity.status === "ambiguous") {
      unresolved.push({ personId: person.id, personName: person.name, reason: "ambiguous_email" });
      continue;
    }
    if (identity.status === "unmapped") {
      unresolved.push({ personId: person.id, personName: person.name, reason: "unmapped_account" });
      continue;
    }

    if (subscribed.has(identity.userId)) pushCapable.push({ personId: person.id, userId: identity.userId });
    else inboxOnly.push({ personId: person.id, userId: identity.userId });
  }

  return { pushCapable, inboxOnly, unresolved };
}

export type DispatchScheduledBroadcastOutcome =
  | { ok: true; batchId: string; resolvedRecipientCount: number }
  | { ok: false; error: "idempotency_conflict" };

/**
 * The one dispatch boundary for an ALREADY-CLAIMED (`status = 'claimed'`)
 * scheduled broadcast -- used identically by the worker tick (via
 * `runDueScheduledBroadcastDispatch`) and "שלח עכשיו" (via
 * `sendScheduledBroadcastNow`), never a separate direct-send path for
 * either (spec §4).
 *
 * Two resumption states:
 *  - `row.batchId` already set: a PRIOR call already created (or found)
 *    the batch and checkpointed it (`setManagerScheduledBroadcastBatchId`)
 *    before crashing -- reuse that EXACT batch and its own frozen
 *    `resolvedRecipientUserIds`, never re-resolve recipients.
 *  - `row.batchId` unset: a fresh dispatch. Resolves recipients from
 *    scratch (`resolveScheduledDispatchTargets`), creates/finds the batch
 *    via the SAME idempotency machinery `manualBroadcast.ts` uses
 *    (`insertManagerNotificationBatchIfAbsent` + `isSameLogicalBroadcastRequest`),
 *    then IMMEDIATELY checkpoints `batch_id` -- from that instant on, a
 *    crash only ever needs to retry idempotent job creation below, never
 *    re-decide whether/how the batch should exist.
 *
 * Job creation reuses the exact `manual:<batchId>:<userId>` dedupe-key
 * convention and `MANAGER_BROADCAST_CATEGORY` PR #78 already uses, so
 * these jobs flow through the identical existing worker delivery
 * pipeline/inbox -- never a second one.
 */
export async function dispatchScheduledBroadcast(
  row: ManagerScheduledBroadcastRow,
  people: readonly Person[],
): Promise<DispatchScheduledBroadcastOutcome> {
  let batchId = row.batchId;
  let resolvedRecipientUserIds: readonly string[];
  let title = row.title;
  let body = row.body;

  if (batchId) {
    const existing = await getManagerNotificationBatchById(batchId);
    if (!existing) {
      throw new Error(`manager_scheduled_broadcasts ${row.id} references missing batch ${batchId}`);
    }
    resolvedRecipientUserIds = existing.resolvedRecipientUserIds;
    title = existing.title;
    body = existing.body;
  } else {
    const [emailToAccount, subscribedUserIds] = await Promise.all([
      fetchAllUserIdsByEmail(),
      fetchAllSubscribedUserIds(),
    ]);
    const subscribed = new Set(subscribedUserIds);
    const resolution = resolveScheduledDispatchTargets(row.targetPersonIds, people, emailToAccount, subscribed);
    const freshRecipientUserIds = [
      ...new Set([...resolution.pushCapable, ...resolution.inboxOnly].map((recipient) => recipient.userId)),
    ].sort();

    const { row: batch, created } = await insertManagerNotificationBatchIfAbsent({
      idempotencyKey: scheduledBroadcastIdempotencyKey(row.id),
      createdByPersonId: row.createdByPersonId,
      createdByPersonName: row.createdByPersonName,
      audienceKind: row.audienceKind,
      targetPersonIds: row.targetPersonIds,
      resolvedRecipientUserIds: freshRecipientUserIds,
      title: row.title,
      body: row.body,
      resolvedRecipientCount: freshRecipientUserIds.length,
      pushCapableCount: resolution.pushCapable.length,
      inboxOnlyCount: resolution.inboxOnly.length,
      unresolvedCount: resolution.unresolved.length,
    });

    if (!created) {
      const isReplay = isSameLogicalBroadcastRequest(batch, {
        createdByPersonId: row.createdByPersonId,
        audienceKind: row.audienceKind,
        targetPersonIds: row.targetPersonIds,
        title: row.title,
        body: row.body,
      });
      if (!isReplay) return { ok: false, error: "idempotency_conflict" };
    }

    await setManagerScheduledBroadcastBatchId(row.id, batch.id);
    batchId = batch.id;
    resolvedRecipientUserIds = batch.resolvedRecipientUserIds;
    title = batch.title;
    body = batch.body;
  }

  const scheduledFor = new Date().toISOString();
  await Promise.all(
    resolvedRecipientUserIds.map((recipientUserId) =>
      insertNotificationJobIfAbsent({
        category: MANAGER_BROADCAST_CATEGORY,
        recipientUserId,
        title,
        body,
        path: "/",
        dedupeKey: `manual:${batchId}:${recipientUserId}`,
        scheduledFor,
        sourceRef: `manual:${batchId}`,
      }),
    ),
  );

  await markManagerScheduledBroadcastDispatched(row.id);

  return { ok: true, batchId, resolvedRecipientCount: resolvedRecipientUserIds.length };
}

export interface RunDueScheduledBroadcastDispatchSummary {
  claimed: number;
  dispatched: number;
  failed: number;
}

/**
 * The worker tick's own phase (see `pipeline.ts`): claims every due
 * scheduled broadcast (`claim_due_manager_scheduled_broadcasts`'s atomic
 * `for update skip locked` claim -- safe under overlapping ticks) and
 * dispatches each with the roster THIS SAME TICK already fetched, never a
 * second Google read.
 */
export async function runDueScheduledBroadcastDispatch(
  people: readonly Person[],
  limit = 50,
): Promise<RunDueScheduledBroadcastDispatchSummary> {
  const due = await claimDueManagerScheduledBroadcasts(limit);
  let dispatched = 0;
  let failed = 0;
  for (const row of due) {
    const outcome = await dispatchScheduledBroadcast(row, people);
    if (outcome.ok) dispatched++;
    else failed++;
  }
  return { claimed: due.length, dispatched, failed };
}

export type SendScheduledBroadcastNowOutcome =
  | { ok: true; batchId: string; resolvedRecipientCount: number }
  | { ok: false; error: "not_found" | "already_started" | "already_cancelled" | "idempotency_conflict" };

/**
 * "שלח עכשיו" -- claims the ONE named broadcast via the same atomic,
 * fail-closed single-row claim (`claim_manager_scheduled_broadcast_now`,
 * race-safe against a concurrently-firing worker tick) and then dispatches
 * it through the EXACT SAME `dispatchScheduledBroadcast` the worker tick
 * uses (spec §4: never a separate direct-send implementation).
 */
export async function sendScheduledBroadcastNow(
  id: string,
  people: readonly Person[],
): Promise<SendScheduledBroadcastNowOutcome> {
  const claimed = await claimManagerScheduledBroadcastNow(id);
  if (!claimed) return await notEditableError(id);

  return dispatchScheduledBroadcast(claimed, people);
}
