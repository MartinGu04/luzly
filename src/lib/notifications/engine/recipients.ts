import "server-only";
import type { Person } from "@/lib/domain/types";
import { findPersonByEmail } from "@/lib/auth/resolveCurrentPerson";
import { getNotificationServiceClient } from "./serviceClient";

export interface ResolvedRecipient {
  personId: string;
  email: string;
  userId: string;
}

/**
 * PII-safe counts only -- see PR #30 spec section 5 ("record only a
 * PII-safe diagnostic/count") and section 25 (never log names/emails).
 * `resolved` itself carries emails/ids because it is consumed
 * server-side by the same worker request, never logged as a whole.
 */
export interface RecipientResolution {
  resolved: Map<string, ResolvedRecipient>;
  unmappedCount: number;
  ambiguousEmailCount: number;
  noEmailCount: number;
}

const MAX_LIST_USERS_PAGES = 50;
const LIST_USERS_PER_PAGE = 1000;

/** Trimmed + lowercased -- the ONE normalization rule every email comparison in the notification engine (recipient resolution, readiness) shares. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Every Supabase auth user's normalized email -> user id, via the Admin
 * API (service-role only). Exported (PR #40) so `readiness.ts` can reuse
 * the exact same live account lookup for the manager notification-
 * readiness view instead of re-querying/re-implementing it -- one shared
 * identity source of truth, never two.
 */
export async function fetchAllUserIdsByEmail(): Promise<Map<string, string>> {
  const supabase = getNotificationServiceClient();
  const emailToUserId = new Map<string, string>();

  for (let page = 1; page <= MAX_LIST_USERS_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: LIST_USERS_PER_PAGE });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) emailToUserId.set(normalizeEmail(user.email), user.id);
    }
    if (data.users.length < LIST_USERS_PER_PAGE) break;
  }

  return emailToUserId;
}

/**
 * Maps every כ"א `Person` with a usable, unambiguous email to their
 * Supabase auth user id -- the ONLY recipient-resolution path the
 * notification engine uses (PR #30 spec section 5: "prefer the existing
 * normalized email/person identifier... never target by display-name
 * guessing... if a person cannot be mapped reliably, skip delivery").
 *
 * Reuses `findPersonByEmail` (the exact same trimmed/lowercased,
 * fail-closed-on-ambiguity comparison `lib/auth/resolveCurrentPerson.ts`
 * uses for the interactive login path) rather than re-deriving the
 * matching rule here -- a person whose email collides (case/whitespace
 * aside) with another כ"א record is skipped for BOTH, never a silent
 * first-match.
 */
export async function resolveNotificationRecipients(
  people: readonly Person[],
): Promise<RecipientResolution> {
  const emailToUserId = await fetchAllUserIdsByEmail();

  const resolved = new Map<string, ResolvedRecipient>();
  let unmappedCount = 0;
  let ambiguousEmailCount = 0;
  let noEmailCount = 0;
  const consideredEmails = new Set<string>();

  for (const person of people) {
    if (!person.email) {
      noEmailCount++;
      continue;
    }

    const normalized = normalizeEmail(person.email);
    if (consideredEmails.has(normalized)) continue;
    consideredEmails.add(normalized);

    const lookup = findPersonByEmail(people, person.email);
    if (lookup.status === "ambiguous") {
      ambiguousEmailCount++;
      continue;
    }
    if (lookup.status === "not_found") continue; // unreachable: person.email is itself a member of `people`

    const userId = emailToUserId.get(normalized);
    if (!userId) {
      unmappedCount++;
      continue;
    }

    resolved.set(lookup.person.id, { personId: lookup.person.id, email: normalized, userId });
  }

  return { resolved, unmappedCount, ambiguousEmailCount, noEmailCount };
}

/** Resolved recipients who are managers per `Person.isManager` -- no separate hardcoded manager list, per PR #30 spec section 5. */
export function filterManagerRecipients(
  people: readonly Person[],
  resolution: RecipientResolution,
): ResolvedRecipient[] {
  const recipients: ResolvedRecipient[] = [];
  for (const person of people) {
    if (!person.isManager) continue;
    const recipient = resolution.resolved.get(person.id);
    if (recipient) recipients.push(recipient);
  }
  return recipients;
}

/**
 * Every distinct Supabase user id with at least one active push
 * subscription. Originally added for weekly constraints reminders (spec
 * section 18), which target "all push-enabled users" independent of any
 * כ"א/email mapping -- also reused (PR #40) as the ONE bulk subscription
 * query the manager notification-readiness view needs, instead of calling
 * `getActiveSubscriptionsForUser()` once per roster person.
 */
export async function fetchAllSubscribedUserIds(): Promise<string[]> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase.from("push_subscriptions").select("user_id");
  if (error) throw error;

  const userIds = new Set<string>();
  for (const row of (data ?? []) as { user_id: string }[]) {
    userIds.add(row.user_id);
  }
  return [...userIds];
}
