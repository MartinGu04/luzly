import "server-only";
import { findPersonByEmail } from "@/lib/auth/resolveCurrentPerson";
import type { Person } from "@/lib/domain/types";
import { fetchAllSubscribedUserIds, fetchAllUserIdsByEmail, normalizeEmail } from "./recipients";

/**
 * PR #40 -- every deterministic state a roster person can resolve to when
 * asking "can Mi-Ma-Mo currently target a personal push notification to
 * this person, all the way to at least one registered device?". This is a
 * STRICTLY stronger question than `resolveNotificationRecipients`'
 * identity mapping (personnel person -> unique email -> matching auth
 * user): that alone does NOT prove push delivery is possible -- a mapped
 * account with zero rows in `push_subscriptions` still gets its
 * notification job marked `skipped` by `delivery.ts`. `no_push_subscription`
 * is the state that makes that gap visible instead of silently absorbed.
 *
 * Precedence is evaluated in this exact order (see `resolvePersonReadiness`)
 * so every person lands in EXACTLY ONE state, never two:
 * missing_email > ambiguous_email > unmapped_account > no_push_subscription
 * > ready. No finer state is ever invented -- these five are everything
 * the system can actually prove from `כ"א` + Supabase auth + push_subscriptions.
 */
export type PersonNotificationReadiness =
  | "ready"
  | "missing_email"
  | "ambiguous_email"
  | "unmapped_account"
  | "no_push_subscription";

export interface PersonReadinessResult {
  personId: string;
  status: PersonNotificationReadiness;
}

/**
 * Computes every roster person's `PersonNotificationReadiness` in one
 * bulk pass -- never `getActiveSubscriptionsForUser()` per person (that
 * would be one `push_subscriptions` query per roster member). Identity
 * mapping (`fetchAllUserIdsByEmail`, the Supabase Admin API) and push-
 * subscription membership (`fetchAllSubscribedUserIds`, a single bulk
 * `push_subscriptions` select) are fetched CONCURRENTLY via `Promise.all`
 * -- they're independent reads with no data dependency on each other.
 *
 * Reuses `findPersonByEmail` -- the EXACT SAME fail-closed-on-ambiguity
 * email-matching rule `resolveNotificationRecipients` (the worker's own
 * recipient resolution) and the interactive login path both already use
 * -- so the manager-facing readiness view and the worker's actual
 * targeting logic can never quietly drift apart. This function does NOT
 * change or duplicate `resolveNotificationRecipients`'s own aggregate
 * counting behavior (its PII-safe worker logs are untouched) -- it's a
 * separate, per-person projection built from the same underlying primitives.
 */
export async function computeNotificationReadiness(
  people: readonly Person[],
): Promise<PersonReadinessResult[]> {
  const [emailToUserId, subscribedUserIds] = await Promise.all([
    fetchAllUserIdsByEmail(),
    fetchAllSubscribedUserIds(),
  ]);
  const subscribed = new Set(subscribedUserIds);

  return people.map((person) => ({
    personId: person.id,
    status: resolvePersonReadiness(person, people, emailToUserId, subscribed),
  }));
}

function resolvePersonReadiness(
  person: Person,
  people: readonly Person[],
  emailToUserId: ReadonlyMap<string, string>,
  subscribedUserIds: ReadonlySet<string>,
): PersonNotificationReadiness {
  if (!person.email) return "missing_email";

  const lookup = findPersonByEmail(people, person.email);
  if (lookup.status === "ambiguous") return "ambiguous_email";
  if (lookup.status === "not_found") return "missing_email"; // unreachable: person.email is itself a member of `people`

  const userId = emailToUserId.get(normalizeEmail(person.email));
  if (!userId) return "unmapped_account";

  return subscribedUserIds.has(userId) ? "ready" : "no_push_subscription";
}
