import "server-only";
import type { Person } from "@/lib/domain/types";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { getJerusalemLocalNow, jerusalemLocalTimeToInstant } from "@/lib/time/jerusalemClock";
import { BROADCAST_BODY_MAX_LENGTH, BROADCAST_TITLE_MAX_LENGTH } from "../manualBroadcastLimits";
import { fetchAllSubscribedUserIds, fetchAllUserIdsByEmail, resolvePersonIdentity, type AuthAccountLookup } from "./recipients";
import {
  isSameLogicalBroadcastRequest,
  MANAGER_BROADCAST_CATEGORY,
  resolveAudience,
  sameIdSet,
  validateAudienceCardinality,
  validateText,
  type BroadcastUnresolvedPerson,
} from "./manualBroadcast";
import {
  cancelManagerScheduledBroadcastIfEditable,
  claimDueManagerScheduledBroadcasts,
  claimManagerScheduledBroadcastNow,
  getManagerNotificationBatchById,
  getManagerScheduledBroadcastByCreateIdempotencyKey,
  getManagerScheduledBroadcastById,
  insertManagerNotificationBatchIfAbsent,
  insertManagerScheduledBroadcastIfAbsent,
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
 * Israel-local civil date + clock time -> the UTC instant it refers to, or
 * `null` for anything structurally invalid (bad date, out-of-range hour/
 * minute, or a local wall-clock time that does not exist). Reuses the
 * domain's own calendar-date validation (`parseCalendarDate`) and the
 * codebase's one canonical local-time-to-instant conversion
 * (`jerusalemLocalTimeToInstant`) -- never hand-rolls either.
 *
 * `jerusalemLocalTimeToInstant` was written for a handful of FIXED
 * reminder hours (20:00/18:00/09:00, never near midnight) and its own
 * docstring says it does not perfectly resolve a wall-clock time that
 * falls exactly inside a DST transition's skipped/repeated hour -- an
 * edge case that assumption tolerated because no reminder ever lands
 * there. A manager-controlled time picker can request ANY hour, so that
 * assumption is no longer safe: on the Asia/Jerusalem spring-forward
 * transition (01:59 -> 03:00), a nonexistent local time like 02:30 would
 * otherwise silently normalize to some other instant (e.g. 03:30) --
 * the manager would believe they scheduled 02:30 while the stored
 * instant represents something else entirely.
 *
 * Fixed by round-tripping: convert the requested local date/hour/minute
 * to an instant, then convert that instant BACK to Asia/Jerusalem local
 * civil terms via `getJerusalemLocalNow` (the exact reverse of
 * `jerusalemLocalTimeToInstant`) and require the round-tripped date and
 * minute-of-day to match the manager's request exactly. A nonexistent
 * local time can never round-trip to itself (the forward conversion is
 * forced to land on SOME real instant, whose reverse reading is
 * necessarily a different wall-clock time), so it fails closed as
 * `invalid_schedule` here rather than silently shifting. A genuinely
 * repeated local time (autumn fall-back) round-trips correctly to
 * whichever of the two real instants `jerusalemLocalTimeToInstant`
 * deterministically picked -- acceptable for V1 (see this feature's own
 * spec), since the manager's requested wall-clock time is still exactly
 * honored either way.
 *
 * Deliberately does NOT check "is this in the future" -- that rule only
 * applies to a genuinely NEW create/edit, never to resolving what a
 * CREATE-IDEMPOTENCY replay candidate's requested instant was (see
 * `createScheduledBroadcast`): a retry of an already-successful create,
 * arriving after its own scheduled time has since passed, must still be
 * able to compute the SAME instant the original request produced in
 * order to recognize itself as a replay. Callers that need the future
 * rule (a genuinely new create, or any edit) use
 * `resolveValidatedScheduleInstant` below instead.
 */
function resolveScheduledInstant(dateStr: string, hour: number, minute: number): Date | null {
  if (!parseCalendarDate(dateStr)) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  const instant = jerusalemLocalTimeToInstant(dateStr, hour, minute);

  const roundTrip = getJerusalemLocalNow(instant);
  if (roundTrip.date !== dateStr || roundTrip.minuteOfDay !== hour * 60 + minute) return null;

  return instant;
}

/** `resolveScheduledInstant` plus the "must be in the future" rule -- used by a genuinely NEW create and by every edit (never a replay candidate, see that function's own docstring). */
function resolveValidatedScheduleInstant(dateStr: string, hour: number, minute: number): Date | null {
  const instant = resolveScheduledInstant(dateStr, hour, minute);
  if (!instant) return null;
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

export interface CreateScheduledBroadcastInput extends ScheduledBroadcastInput {
  /**
   * Client-generated once per compose session (e.g. `crypto.randomUUID()`),
   * unchanged across a retry -- the exactly-once CREATE guard, the SAME
   * pattern PR #78's immediate send already uses for its own
   * `idempotencyKey`. This is a SEPARATE idempotency boundary from the
   * eventual batch's `scheduled:<id>` key (see `dispatchScheduledBroadcast`)
   * -- it only ever guards this row's own creation, never dispatch.
   */
  createIdempotencyKey: string;
}

export type CreateScheduledBroadcastOutcome =
  | { ok: true; row: ManagerScheduledBroadcastRow }
  | { ok: false; error: ScheduledBroadcastValidationError | "idempotency_conflict" };

/**
 * Whether `candidate` is a REPLAY of the exact same logical create
 * request the stored row (found via a reused `create_idempotency_key`)
 * already represents. Mirrors `manualBroadcast.ts`'s own
 * `isSameLogicalBroadcastRequest` exactly, plus `scheduledFor` (a
 * dimension the immediate-send comparison has no equivalent of) --
 * `"everyone"` deliberately never compares target ids, for the same
 * reason as the immediate-send comparison: that audience is derived from
 * the roster at request time, not client-supplied, so a roster that
 * changed between two near-simultaneous requests must never itself
 * manufacture a false conflict.
 *
 * `scheduledFor` is compared as a plain string -- safe ONLY because both
 * sides are already canonical ISO-8601 (`.toISOString()`) by the time
 * they reach here: `stored.scheduledFor` was canonicalized once, at the
 * store's own row-mapping boundary (`toScheduledBroadcastRow`), and
 * `candidate.scheduledFor` is always `Date#toISOString()`'s own output
 * (see `createScheduledBroadcast`). Postgres/PostgREST can otherwise
 * represent the identical `timestamptz` instant as `+00:00` instead of
 * `.000Z` -- comparing RAW, uncanonicalized strings here would treat a
 * genuine replay as a false conflict. Never compare instants as strings
 * anywhere they might not already be canonical.
 */
function isSameLogicalScheduledCreateRequest(
  stored: Pick<ManagerScheduledBroadcastRow, "createdByPersonId" | "audienceKind" | "targetPersonIds" | "title" | "body" | "scheduledFor">,
  candidate: {
    createdByPersonId: string;
    audienceKind: BroadcastAudienceKind;
    targetPersonIds: readonly string[];
    title: string;
    body: string;
    scheduledFor: string;
  },
): boolean {
  if (stored.createdByPersonId !== candidate.createdByPersonId) return false;
  if (stored.audienceKind !== candidate.audienceKind) return false;
  if (stored.title !== candidate.title) return false;
  if (stored.body !== candidate.body) return false;
  if (stored.scheduledFor !== candidate.scheduledFor) return false;
  if (stored.audienceKind === "everyone") return true;
  return sameIdSet(stored.targetPersonIds, candidate.targetPersonIds);
}

/** Whatever `createScheduledBroadcast`'s candidate request represents, independent of whether it turns out to be a fresh create or a replay -- built once from request-shape-only validation, before either the roster or "still in the future" is consulted. */
interface ScheduledCreateCandidate {
  createdByPersonId: string;
  audienceKind: BroadcastAudienceKind;
  /** The client's own requested ids, NOT yet validated against any roster -- see `createScheduledBroadcast`'s own docstring for why a replay must never require this. */
  targetPersonIds: readonly string[];
  title: string;
  body: string;
  scheduledForInstant: Date;
}

/** Resolves an already-found existing row (via a reused `create_idempotency_key`) as either a safe replay (returns it unchanged) or a genuine conflict (fails closed) -- shared by the initial-lookup path and the race path below. */
function resolveExistingScheduledCreate(
  existing: ManagerScheduledBroadcastRow,
  candidate: ScheduledCreateCandidate,
): CreateScheduledBroadcastOutcome {
  const isReplay = isSameLogicalScheduledCreateRequest(existing, {
    createdByPersonId: candidate.createdByPersonId,
    audienceKind: candidate.audienceKind,
    targetPersonIds: candidate.targetPersonIds,
    title: candidate.title,
    body: candidate.body,
    scheduledFor: candidate.scheduledForInstant.toISOString(),
  });
  if (!isReplay) return { ok: false, error: "idempotency_conflict" };
  return { ok: true, row: existing };
}

/**
 * Saves a new scheduled broadcast -- deliberately creates NO
 * `notification_jobs` yet (see this module's own file docstring / the
 * migration's doc comment). `"everyone"` is expanded against the fresh
 * roster right now and frozen into `target_person_ids` -- a person added
 * to כ"א afterward can never silently join this schedule.
 *
 * Idempotent by `createIdempotencyKey`, but -- critically -- a REPLAY of
 * an already-successful create must be recognized independently of
 * whatever has changed in the outside world SINCE that original success:
 * the scheduled instant may have already passed, and a targeted person
 * may have since left the roster. Neither is a reason to reject a retry
 * that is really just asking "did my earlier request already succeed?".
 * So this looks the key up FIRST:
 *
 *  1. Build the candidate from request-shape-only validation alone
 *     (title/body trimming, audience cardinality, and resolving the
 *     requested local date/time to an instant WITHOUT the "must be in
 *     the future" rule -- `resolveScheduledInstant`) -- nothing here
 *     depends on the current roster or the current clock.
 *  2. If `createIdempotencyKey` already has a row, decide replay vs.
 *     conflict from the candidate exactly as built above -- never
 *     re-validate it as if it were a fresh request today
 *     (`resolveExistingScheduledCreate`).
 *  3. Only when the key is genuinely new does this apply the NEW-CREATE-
 *     only rules: `targetPersonIds` must resolve against the FRESH
 *     roster (`resolveAudience`) and the instant must still be in the
 *     future.
 *  4. `insertManagerScheduledBroadcastIfAbsent` can still lose a race to
 *     a concurrent identical request between step 2's lookup and its own
 *     insert -- if so, it resolves that race the SAME way as step 2,
 *     never by retrying the insert or treating it as a fresh row.
 *
 * A reused key whose stored row is NOT the same logical request fails
 * closed as `idempotency_conflict`, never creating a second row and
 * never mutating the existing one -- this path NEVER performs an
 * `update` on conflict, so even a very late replay of the original
 * create request can never overwrite an edit the manager made to the row
 * afterward (an edit changes the row's content, so a stale replay of the
 * pre-edit request correctly stops matching it and fails closed, rather
 * than silently reverting the edit).
 */
export async function createScheduledBroadcast(input: CreateScheduledBroadcastInput): Promise<CreateScheduledBroadcastOutcome> {
  const title = validateText(input.title, BROADCAST_TITLE_MAX_LENGTH);
  if (title === null) return { ok: false, error: "invalid_title" };

  const body = validateText(input.body, BROADCAST_BODY_MAX_LENGTH);
  if (body === null) return { ok: false, error: "invalid_body" };

  if (!validateAudienceCardinality(input.audienceKind, input.targetPersonIds)) {
    return { ok: false, error: "invalid_audience" };
  }

  const scheduledForInstant = resolveScheduledInstant(input.scheduledDate, input.scheduledHour, input.scheduledMinute);
  if (!scheduledForInstant) return { ok: false, error: "invalid_schedule" };

  const candidate: ScheduledCreateCandidate = {
    createdByPersonId: input.manager.id,
    audienceKind: input.audienceKind,
    targetPersonIds: input.targetPersonIds,
    title,
    body,
    scheduledForInstant,
  };

  const existing = await getManagerScheduledBroadcastByCreateIdempotencyKey(input.createIdempotencyKey);
  if (existing) return resolveExistingScheduledCreate(existing, candidate);

  // Genuinely new -- only NOW do the NEW-CREATE-only rules apply: the
  // roster and "still in the future" as they stand RIGHT NOW.
  const targets = resolveAudience(input.audienceKind, input.people, input.targetPersonIds);
  if (targets === null) return { ok: false, error: "invalid_targets" };
  if (targets.length === 0) return { ok: false, error: "no_targets" };
  if (scheduledForInstant.getTime() <= Date.now()) return { ok: false, error: "invalid_schedule" };

  const canonicalTargetPersonIds = [...new Set(targets.map((person) => person.id))];

  const { row, created } = await insertManagerScheduledBroadcastIfAbsent({
    createIdempotencyKey: input.createIdempotencyKey,
    audienceKind: input.audienceKind,
    targetPersonIds: canonicalTargetPersonIds,
    title,
    body,
    scheduledFor: scheduledForInstant.toISOString(),
    createdByPersonId: input.manager.id,
    createdByPersonName: input.manager.name,
  });

  if (!created) {
    // Race: some other request inserted this exact key between our lookup
    // above and this insert -- resolve it the same way, never a retry.
    return resolveExistingScheduledCreate(row, { ...candidate, targetPersonIds: canonicalTargetPersonIds });
  }

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

/**
 * Who the eventual `manager_notification_batches` row should identify as
 * the sending manager. Automatic due-dispatch (`sent_now_by_person_id` is
 * null) keeps the ORIGINAL scheduling manager -- "normal scheduled worker
 * dispatch may remain the manager who originally scheduled it". A "שלח
 * עכשיו" claim (`sent_now_by_person_id` set atomically by
 * `claim_manager_scheduled_broadcast_now`, from the authenticated caller,
 * never client-supplied) instead identifies whoever actually pressed
 * send-now -- so "נשלחו לאחרונה" never attributes an explicit immediate
 * send to a DIFFERENT manager than the one who triggered it.
 */
function batchCreatorForRow(row: ManagerScheduledBroadcastRow): { id: string; name: string } {
  if (row.sentNowByPersonId && row.sentNowByPersonName) {
    return { id: row.sentNowByPersonId, name: row.sentNowByPersonName };
  }
  return { id: row.createdByPersonId, name: row.createdByPersonName };
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

    const creator = batchCreatorForRow(row);

    const { row: batch, created } = await insertManagerNotificationBatchIfAbsent({
      idempotencyKey: scheduledBroadcastIdempotencyKey(row.id),
      createdByPersonId: creator.id,
      createdByPersonName: creator.name,
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
        createdByPersonId: creator.id,
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
 *
 * `sentNowBy` is the AUTHENTICATED caller (never client-supplied identity
 * -- the server action resolves it via `loadManagerWorkbookContext`
 * before this is ever called) and is recorded atomically with the
 * winning claim itself, so only the manager whose claim actually
 * succeeds is ever attributed -- see `claim_manager_scheduled_broadcast_now`
 * and `batchCreatorForRow`.
 */
export async function sendScheduledBroadcastNow(
  id: string,
  people: readonly Person[],
  sentNowBy: Person,
): Promise<SendScheduledBroadcastNowOutcome> {
  const claimed = await claimManagerScheduledBroadcastNow(id, sentNowBy.id, sentNowBy.name);
  if (!claimed) return await notEditableError(id);

  return dispatchScheduledBroadcast(claimed, people);
}
