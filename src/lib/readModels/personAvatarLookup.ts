import "server-only";
import { unstable_cache } from "next/cache";
import { findPersonByEmail } from "@/lib/auth/resolveCurrentPerson";
import type { Person } from "@/lib/domain/types";
import { fetchAllUserIdsByEmail, normalizeEmail } from "@/lib/notifications/engine/recipients";

/**
 * How long the bulk email -> Google-avatar lookup stays reusable across
 * requests, in seconds. Same short-TTL convention (and same 30s value)
 * `lib/sync/workbookSnapshotCache.ts` already established for the Google
 * Sheets read -- this exists for the exact same reason: unlike the
 * previous callers of the underlying Supabase Admin API `listUsers()`
 * call (`fetchAllUserIdsByEmail`, until now only reached from the
 * notification worker's own Cron tick and the manager-only adoption
 * view), the Fairness tables are a normal main-navigation destination
 * every mapped user (manager or not) can load, so this is genuinely NEW,
 * higher-frequency traffic to a privileged, RLS-bypassing Admin API call.
 * A short cache keeps that traffic bounded (a burst of different users
 * loading /fairness within the same few seconds reuses one Admin API
 * call) without ever letting a photo go stale for more than half a
 * minute.
 *
 * This module started as Fairness's own lookup (hence the original
 * filename); it carries no Fairness-specific logic at all, so any future
 * feature needing "this roster's real Google avatar photos, in bulk" (e.g.
 * the Shooting Ranges manager panel -- see `shootingRangeManagerOverview.ts`)
 * reuses these same two functions rather than re-implementing this pattern
 * -- see `lib/readModels/README.md`'s "Person avatar" convention.
 */
const AVATAR_LOOKUP_CACHE_REVALIDATE_SECONDS = 30;

/**
 * The cached fetch itself: every Supabase auth account's normalized email
 * -> avatar URL, and NOTHING else -- deliberately narrower than
 * `fetchAllUserIdsByEmail`'s own `AuthAccountLookup` (which also carries
 * `userId`), since `userId` has no use here and `unstable_cache` persists
 * whatever this returns. Returns a plain array of tuples, not a `Map`
 * (which does not survive `unstable_cache`'s JSON-based serialization) --
 * `fetchEmailToAvatarUrl` below reconstructs the `Map` on every call.
 */
const getCachedEmailAvatarEntries = unstable_cache(
  async (): Promise<[string, string | null][]> => {
    const emailToAccount = await fetchAllUserIdsByEmail();
    return [...emailToAccount.entries()].map(([email, account]) => [email, account.avatarUrl]);
  },
  ["person-avatar-lookup"],
  { revalidate: AVATAR_LOOKUP_CACHE_REVALIDATE_SECONDS },
);

/**
 * Every Supabase auth account's normalized email -> Google avatar photo,
 * account-wide -- deliberately roster-INDEPENDENT (never filtered by כ"א/
 * roster at this step) so a caller can kick this off CONCURRENTLY with
 * its own workbook fetch/personnel parse (see
 * `fairnessWorkbookContext.ts`), rather than waiting for the roster to
 * resolve first. `resolveAvatarUrlsByPersonId` below is the roster-aware
 * matching step, kept separate and PURE for exactly that reason.
 */
export async function fetchEmailToAvatarUrl(): Promise<ReadonlyMap<string, string | null>> {
  return new Map(await getCachedEmailAvatarEntries());
}

/**
 * Matches an already-fetched account-wide email->avatar map against ONE
 * specific roster, producing personId -> avatarUrl -- pure, no I/O of its
 * own, so it's cheap to call once per Fairness read-model build with no
 * extra Admin API traffic.
 *
 * Fails closed exactly like every other email-based identity resolution
 * in this codebase (`findPersonByEmail`, the same rule
 * `resolveCurrentPerson`/`resolvePersonIdentity` already use): a person
 * with no email, or whose email is shared (case/whitespace aside) with
 * another roster record, never gets a photo attributed to them -- never a
 * coin-flip guess at whose photo it actually is. This is the safety net
 * behind "users cannot accidentally receive another person's image due
 * to a bad ID/person mapping".
 */
export function resolveAvatarUrlsByPersonId(
  people: readonly Person[],
  emailToAvatarUrl: ReadonlyMap<string, string | null>,
): ReadonlyMap<string, string | null> {
  const byPersonId = new Map<string, string | null>();

  for (const person of people) {
    if (!person.email) continue;
    const lookup = findPersonByEmail(people, person.email);
    if (lookup.status !== "found") continue; // ambiguous -- never guess whose photo it is
    byPersonId.set(person.id, emailToAvatarUrl.get(normalizeEmail(person.email)) ?? null);
  }

  return byPersonId;
}
