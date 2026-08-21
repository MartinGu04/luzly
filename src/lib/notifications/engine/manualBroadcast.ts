import "server-only";
import type { Person } from "@/lib/domain/types";
import { BROADCAST_BODY_MAX_LENGTH, BROADCAST_TITLE_MAX_LENGTH } from "../manualBroadcastLimits";
import { fetchAllSubscribedUserIds, fetchAllUserIdsByEmail, resolvePersonIdentity } from "./recipients";
import {
  insertManagerNotificationBatchIfAbsent,
  insertNotificationJobIfAbsent,
  type BroadcastAudienceKind,
} from "./store";

export type { BroadcastAudienceKind } from "./store";
export { BROADCAST_BODY_MAX_LENGTH, BROADCAST_TITLE_MAX_LENGTH } from "../manualBroadcastLimits";

/** The stable category every manager-initiated manual broadcast job carries -- reused as-is by the existing worker/inbox pipeline, never a new category concept. */
export const MANAGER_BROADCAST_CATEGORY = "manager_broadcast";

export interface BroadcastUnresolvedPerson {
  personId: string;
  personName: string;
  /** Mirrors `PersonNotificationReadiness`'s own three non-`ready`/non-`no_push_subscription` states -- this person has no safe auth user id to target at all. */
  reason: "missing_email" | "ambiguous_email" | "unmapped_account";
}

export interface SendManagerBroadcastResult {
  batchId: string;
  resolvedRecipientCount: number;
  pushCapableCount: number;
  inboxOnlyCount: number;
  unresolved: BroadcastUnresolvedPerson[];
}

export type SendManagerBroadcastOutcome =
  | { ok: true; result: SendManagerBroadcastResult }
  | { ok: false; error: "invalid_title" | "invalid_body" | "no_targets" };

export interface SendManagerBroadcastInput {
  /** The sending manager -- already verified `isManager === true` by the caller (`manualBroadcastActions.ts`). Identifies the batch's audit row only, never a recipient. */
  manager: Person;
  /** The full, freshly-parsed personnel roster -- the ONLY source `targetPersonIds`/`"everyone"` are resolved against. Never trusts a client-supplied roster. */
  people: readonly Person[];
  audienceKind: BroadcastAudienceKind;
  /** Candidate roster person ids for `"person"`/`"people"` -- untrusted client input, filtered down to real `people` membership below. Ignored for `"everyone"`. */
  targetPersonIds: readonly string[];
  title: string;
  body: string;
  /** Client-generated per-compose-session key; the ONE thing that makes a retried/double-submitted send idempotent at the batch level (see `insertManagerNotificationBatchIfAbsent`). */
  idempotencyKey: string;
}

function validateText(value: string, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > maxLength) return null;
  return trimmed;
}

/** `"everyone"` means every person currently in the (freshly re-fetched) personnel roster -- never every Supabase auth account. `"person"`/`"people"` are resolved identically: only ids that are genuinely members of `people` survive, so a tampered/stale client id can never target anyone outside the manager's own roster. */
function resolveAudience(
  audienceKind: BroadcastAudienceKind,
  people: readonly Person[],
  targetPersonIds: readonly string[],
): Person[] {
  if (audienceKind === "everyone") return [...people];
  const idSet = new Set(targetPersonIds);
  return people.filter((person) => idSet.has(person.id));
}

/**
 * The one write boundary for a manager's manual broadcast notification.
 * Independently re-resolves every recipient's identity/push-readiness from
 * scratch (the SAME `resolvePersonIdentity`/`fetchAllUserIdsByEmail`/
 * `fetchAllSubscribedUserIds` primitives `readiness.ts`'s manager-facing
 * view and the worker's own recipient targeting already share) -- never
 * trusts a client-supplied auth user id, email, or readiness status.
 *
 * Creates (or, on a retried/duplicate submission, safely reuses) exactly
 * ONE `manager_notification_batches` audit row, then exactly one
 * `notification_jobs` row per DISTINCT resolved Supabase auth user id
 * (both push-capable and inbox-only recipients get a job -- push delivery
 * is a separate, best-effort layer the existing worker owns on top; see
 * `insertNotificationJobIfAbsent`'s own dedupe-by-`dedupe_key` guarantee
 * for why a retry can never duplicate any recipient's job).
 */
export async function sendManagerBroadcastNotification(
  input: SendManagerBroadcastInput,
): Promise<SendManagerBroadcastOutcome> {
  const title = validateText(input.title, BROADCAST_TITLE_MAX_LENGTH);
  if (title === null) return { ok: false, error: "invalid_title" };

  const body = validateText(input.body, BROADCAST_BODY_MAX_LENGTH);
  if (body === null) return { ok: false, error: "invalid_body" };

  const targets = resolveAudience(input.audienceKind, input.people, input.targetPersonIds);
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
  // per roster row, so a shared account is never double-jobbed.
  const recipientsByUserId = new Map<string, { userId: string }>();
  for (const recipient of [...pushCapable, ...inboxOnly]) recipientsByUserId.set(recipient.userId, recipient);

  const batch = await insertManagerNotificationBatchIfAbsent({
    idempotencyKey: input.idempotencyKey,
    createdByPersonId: input.manager.id,
    createdByPersonName: input.manager.name,
    audienceKind: input.audienceKind,
    targetPersonIds: targets.map((person) => person.id),
    title,
    body,
    resolvedRecipientCount: recipientsByUserId.size,
    pushCapableCount: pushCapable.length,
    inboxOnlyCount: inboxOnly.length,
    unresolvedCount: unresolved.length,
  });

  const scheduledFor = new Date().toISOString();
  await Promise.all(
    [...recipientsByUserId.values()].map((recipient) =>
      insertNotificationJobIfAbsent({
        category: MANAGER_BROADCAST_CATEGORY,
        recipientUserId: recipient.userId,
        title,
        body,
        path: "/",
        dedupeKey: `manual:${batch.id}:${recipient.userId}`,
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
      unresolved,
    },
  };
}
