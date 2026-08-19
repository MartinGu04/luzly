import "server-only";
import { getCalendarFeedServiceClient } from "./serviceClient";

export type CalendarFeedOwnerLookupResult =
  | { status: "not_found" }
  | { status: "ok"; email: string };

/**
 * Resolves a raw feed token (from the ICS URL) to the owning Supabase
 * user's email -- the ONE thing `loadCalendarFeedForToken.ts` needs to
 * then map onto a כ"א `Person` the exact same way `resolveCurrentPerson`
 * does for a normal session (email is still the only identity key; this
 * never trusts/returns a display name or the raw Supabase user object).
 *
 * Two lookups against the service-role client, since a feed token only
 * ever stores `user_id` (never a denormalized email that could drift from
 * the real Supabase Auth record): first the `calendar_feeds` row itself,
 * then `auth.admin.getUserById` for that user's current, server-verified
 * email. Fails closed identically for "no such token", "token belongs to
 * a user Auth no longer has a record for", and "that user has no usable
 * email" -- `"not_found"` in every case, revealing nothing about which
 * one actually happened.
 */
export async function resolveCalendarFeedOwnerByToken(token: string): Promise<CalendarFeedOwnerLookupResult> {
  const supabase = getCalendarFeedServiceClient();

  const { data: feedRow, error: feedError } = await supabase
    .from("calendar_feeds")
    .select("user_id")
    .eq("token", token)
    .maybeSingle<{ user_id: string }>();

  if (feedError || !feedRow) return { status: "not_found" };

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(feedRow.user_id);
  if (userError || !userData?.user) return { status: "not_found" };

  const email = userData.user.email;
  if (!email || email.trim() === "") return { status: "not_found" };

  return { status: "ok", email: email.trim() };
}
