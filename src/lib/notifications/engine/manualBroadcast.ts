import "server-only";
import type { Person } from "@/lib/domain/types";
import { BROADCAST_BODY_MAX_LENGTH, BROADCAST_TITLE_MAX_LENGTH } from "../manualBroadcastLimits";
import { fetchAllSubscribedUserIds, fetchAllUserIdsByEmail, resolvePersonIdentity } from "./recipients";
import {
  insertManagerNotificationBatchIfAbsent,
  insertNotificationJobIfAbsent,
  type BroadcastAudienceKind,
  type ManagerNotificationBatchRow,
} from "./store";

export type { BroadcastAudienceKind } from "./store";
export { BROADCAST_BODY_MAX_LENGTH, BROADCAST_TITLE_MAX_LENGTH } from "../manualBroadcastLimits";

/** The stable category every manager-initiated manual broadcast job carries -- reused as-is by the existing worker/inbox pipeline, never a new category concept. */
export const MANAGER_BROADCAST_CATEGORY = "manager_broadcast";

export interface BroadcastUnresolvedPerson {
  personId: string;
  personName: string;
  /**
   * Mirrors `PersonNotificationReadiness`'s own three non-`ready`/non-`no_push_subscription`
   * states -- this person has no safe auth user id to target at all.
   * `"no_longer_in_roster"` is scheduled-dispatch-only (see
   * `scheduledBroadcast.ts`): a stored person-id snapshot whose id no
   * longer matches any current roster member -- never produced by an
   * immediate send, whose audience is always resolved against the SAME
   * fresh roster it validates against.
   */
  reason: "missing_email" | "ambiguous_email" | "unmapped_account" | "no_longer_in_roster";
}

export interface SendManagerBroadcastResult {
  batchId: string;
  resolvedRecipientCount: number;
  pushCapableCount: number;
  inboxOnlyCount: number;
  unresolvedCount: number;
  /**
   * The per-person unresolved breakdown -- populated ONLY when this call
   * genuinely created the batch (freshly computed, describing exactly
   * what just happened). On a replay of an existing batch this is always
   * `[]`: the detailed breakdown was never persisted (only the count
   * was), so a replay can never truthfully reconstruct it -- `unresolvedCount`
   * above is still accurate either way (sourced from the STORED batch),
   * this array simply has less detail on a replay than on a fresh send.
   */
  unresolved: BroadcastUnresolvedPerson[];
}

export type SendManagerBroadcastOutcome =
  | { ok: true; result: SendManagerBroadcastResult }
  | {
      ok: false;
      error:
        | "invalid_title"
        | "invalid_body"
        | "invalid_audience"
        | "invalid_targets"
        | "no_targets"
        | "idempotency_conflict";
    };

export interface SendManagerBroadcastInput {
  /** The sending manager -- already verified `isManager === true` by the caller (`manualBroadcastActions.ts`). Identifies the batch's audit row only, never a recipient. */
  manager: Person;
  /** The full, freshly-parsed personnel roster -- the ONLY source `targetPersonIds`/`"everyone"` are resolved against. Never trusts a client-supplied roster. */
  people: readonly Person[];
  audienceKind: BroadcastAudienceKind;
  /** Candidate roster person ids for `"person"`/`"people"` -- untrusted client input. Every id MUST be a genuine member of `people`, or the whole request fails closed (see `resolveAudience`). Ignored for `"everyone"`. */
  targetPersonIds: readonly string[];
  title: string;
  body: string;
  /** Client-generated per-compose-session key; the ONE thing that makes a retried/double-submitted send idempotent at the batch level (see `insertManagerNotificationBatchIfAbsent` and `isSameLogicalBroadcastRequest`). */
  idempotencyKey: string;
}

/** Exported for `scheduledBroadcast.ts`'s create/edit validation -- the exact same title/body rule an immediate send enforces, never a second copy of it. */
export function validateText(value: string, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * `"everyone"` means every person currently in the (freshly re-fetched)
 * personnel roster -- never every Supabase auth account, and never
 * dependent on client-supplied ids at all. `"person"`/`"people"` resolve
 * ONLY through genuine `people` membership: every requested id (after
 * deduping harmless repeats) must match a real roster person, or the
 * WHOLE request fails closed (`null`) -- a single stale/tampered/unknown
 * id must never silently shrink the audience to "whatever did resolve";
 * it must nuke the whole request before anything is created (see caller).
 * Deliberately never reveals WHICH id was invalid or why -- the caller
 * only fails with one generic `invalid_targets`, never "does id X map to
 * a real account" (that would let a client probe roster membership).
 */
/** Exported for `scheduledBroadcast.ts`'s create/edit path -- same fail-closed audience-resolution rule an immediate send uses (an intentional audience change is a fresh, fully re-validated request). Never reused for DISPATCH-time resolution of an already-stored snapshot, which has different semantics (see that module's own `resolveScheduledDispatchTargets`). */
export function resolveAudience(
  audienceKind: BroadcastAudienceKind,
  people: readonly Person[],
  targetPersonIds: readonly string[],
): Person[] | null {
  if (audienceKind === "everyone") return [...people];

  const byId = new Map(people.map((person) => [person.id, person]));
  const uniqueIds = [...new Set(targetPersonIds)];
  const resolved: Person[] = [];
  for (const id of uniqueIds) {
    const person = byId.get(id);
    if (!person) return null;
    resolved.push(person);
  }
  return resolved;
}

/**
 * Server-side audience CARDINALITY, independent of anything the UI
 * happens to enforce -- a tampered client must never be able to submit
 * `audienceKind: "person"` with more than one id (or zero) while the
 * audit row claims a single-person send. `"people"` requires at least
 * one id; `"everyone"` has no id-based cardinality at all (see
 * `resolveAudience`). Runs AFTER deduping, so harmless repeated ids in
 * the request never trigger a false `"invalid_audience"`.
 */
/** Exported for `scheduledBroadcast.ts`'s create/edit path -- same cardinality rule an immediate send enforces. */
export function validateAudienceCardinality(audienceKind: BroadcastAudienceKind, targetPersonIds: readonly string[]): boolean {
  const uniqueCount = new Set(targetPersonIds).size;
  if (audienceKind === "person") return uniqueCount === 1;
  if (audienceKind === "people") return uniqueCount >= 1;
  return true; // "everyone"
}

/** Canonical (order-independent) target-id comparison -- a client resubmitting the same people in a different array order must never register as a different logical request. */
function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const id of setA) if (!setB.has(id)) return false;
  return true;
}

/**
 * Whether `candidate` is a REPLAY of the exact same logical request the
 * stored batch (found via a reused `idempotency_key`) already represents
 * -- sending manager, audience kind, title, body, and (for `"person"`/
 * `"people"`) the canonical target-id SET. `"everyone"` deliberately never
 * compares target ids: that audience is server-derived from the roster at
 * send time, not client-supplied, so a roster that changed by one person
 * between two nearly-simultaneous requests must never itself manufacture
 * a false `idempotency_conflict` for an "everyone" send. A mismatch on
 * ANY compared field means this is a genuinely different request that
 * happens to reuse an old key -- never a safe replay.
 */
export function isSameLogicalBroadcastRequest(
  stored: Pick<ManagerNotificationBatchRow, "createdByPersonId" | "audienceKind" | "targetPersonIds" | "title" | "body">,
  candidate: {
    createdByPersonId: string;
    audienceKind: BroadcastAudienceKind;
    targetPersonIds: readonly string[];
    title: string;
    body: string;
  },
): boolean {
  if (stored.createdByPersonId !== candidate.createdByPersonId) return false;
  if (stored.audienceKind !== candidate.audienceKind) return false;
  if (stored.title !== candidate.title) return false;
  if (stored.body !== candidate.body) return false;
  if (stored.audienceKind === "everyone") return true;
  return sameIdSet(stored.targetPersonIds, candidate.targetPersonIds);
}

/**
 * The one write boundary for a manager's manual broadcast notification.
 * Independently re-resolves every recipient's identity/push-readiness from
 * scratch (the SAME `resolvePersonIdentity`/`fetchAllUserIdsByEmail`/
 * `fetchAllSubscribedUserIds` primitives `readiness.ts`'s manager-facing
 * view and the worker's own recipient targeting already share) -- never
 * trusts a client-supplied auth user id, email, or readiness status.
 *
 * Idempotency is a THREE-part guarantee, not just "insert with a unique
 * key":
 * 1. `idempotency_key` alone would let a reused key silently ADD
 *    recipients or change content on a later request while reusing the
 *    first request's batch id -- so once an existing batch is found, this
 *    ALWAYS compares it (`isSameLogicalBroadcastRequest`) against the
 *    CURRENT request's manager/audience/targets/title/body before
 *    creating a single job. Any mismatch fails closed as
 *    `idempotency_conflict`, creating ZERO new jobs.
 * 2. Even a genuine replay (identical logical request) must never
 *    re-resolve recipients from the CURRENT roster/auth state: a roster
 *    that grew, or a person whose email/auth mapping newly resolved,
 *    between the original send and a retried/duplicate submission could
 *    otherwise silently add a recipient under the OLD batch id. So a
 *    replay reuses the batch's own STORED `resolvedRecipientUserIds`
 *    (frozen at creation) for job creation, never a fresh resolution --
 *    the batch's logical recipient set is immutable once created.
 * 3. Within that frozen recipient set, `notification_jobs.dedupe_key`
 *    still makes any MISSING job creation safely retryable (e.g. the
 *    original attempt crashed after creating only some jobs) without
 *    ever duplicating a job that already exists.
 */
export async function sendManagerBroadcastNotification(
  input: SendManagerBroadcastInput,
): Promise<SendManagerBroadcastOutcome> {
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

  const [emailToAccount, subscribedUserIds] = await Promise.all([
    fetchAllUserIdsByEmail(),
    fetchAllSubscribedUserIds(),
  ]);
  const subscribed = new Set(subscribedUserIds);

  const pushCapable: { personId: string; userId: string }[] = [];
  const inboxOnly: { personId: string; userId: string }[] = [];
  const unresolved: BroadcastUnresolvedPerson[] = [];

  for (const person of targets) {
    const identity = resolvePersonIdentity(person, input.people, emailToAccount);
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

  // Two roster people can structurally share one email/auth account -- a
  // real notification job is created once per DISTINCT userId, never once
  // per roster row, so a shared account is never double-jobbed. This is
  // the FRESHLY resolved set -- used to create the batch when it's
  // genuinely new, but NEVER used for job creation on a replay (see below).
  const freshRecipientUserIds = [...new Set([...pushCapable, ...inboxOnly].map((recipient) => recipient.userId))].sort();

  const canonicalTargetPersonIds = [...new Set(targets.map((person) => person.id))];

  const { row: batch, created } = await insertManagerNotificationBatchIfAbsent({
    idempotencyKey: input.idempotencyKey,
    createdByPersonId: input.manager.id,
    createdByPersonName: input.manager.name,
    audienceKind: input.audienceKind,
    targetPersonIds: canonicalTargetPersonIds,
    resolvedRecipientUserIds: freshRecipientUserIds,
    title,
    body,
    resolvedRecipientCount: freshRecipientUserIds.length,
    pushCapableCount: pushCapable.length,
    inboxOnlyCount: inboxOnly.length,
    unresolvedCount: unresolved.length,
  });

  // On a genuinely NEW batch, the freshly-resolved set above IS what was
  // just persisted. On a REUSED key, the batch's recipient set is frozen
  // -- job creation must use ONLY the STORED ids, never this call's own
  // (possibly different) fresh resolution.
  let jobRecipientUserIds = freshRecipientUserIds;

  if (!created) {
    const isReplay = isSameLogicalBroadcastRequest(batch, {
      createdByPersonId: input.manager.id,
      audienceKind: input.audienceKind,
      targetPersonIds: canonicalTargetPersonIds,
      title,
      body,
    });
    if (!isReplay) return { ok: false, error: "idempotency_conflict" };
    jobRecipientUserIds = batch.resolvedRecipientUserIds;
  }

  const scheduledFor = new Date().toISOString();
  await Promise.all(
    jobRecipientUserIds.map((recipientUserId) =>
      insertNotificationJobIfAbsent({
        category: MANAGER_BROADCAST_CATEGORY,
        recipientUserId,
        title,
        body,
        path: "/",
        dedupeKey: `manual:${batch.id}:${recipientUserId}`,
        scheduledFor,
        sourceRef: `manual:${batch.id}`,
      }),
    ),
  );

  return {
    ok: true,
    result: {
      batchId: batch.id,
      resolvedRecipientCount: batch.resolvedRecipientCount,
      pushCapableCount: batch.pushCapableCount,
      inboxOnlyCount: batch.inboxOnlyCount,
      unresolvedCount: batch.unresolvedCount,
      // Only meaningful right after a genuine creation -- see this
      // field's own doc comment on `SendManagerBroadcastResult`.
      unresolved: created ? unresolved : [],
    },
  };
}
