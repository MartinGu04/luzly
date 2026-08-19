import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateCalendarFeedToken } from "./token";

interface CalendarFeedRow {
  token: string;
}

export interface CalendarFeedState {
  enabled: boolean;
  /** Only ever populated for the CURRENTLY authenticated user's own row -- see `calendar_feeds`'s RLS policies. */
  token: string | null;
}

/**
 * The current user's own calendar-feed row, RLS-scoped -- `select("*")`
 * on `calendar_feeds` can structurally never return another user's row
 * (see the table's `_select_own` policy), so no extra `user_id` filter is
 * needed for safety here. `{ enabled: false, token: null }` covers both
 * "never enabled" and a query error identically -- callers never need to
 * (and, from an RLS-scoped client, structurally cannot) tell those apart.
 */
export async function getCalendarFeedForCurrentUser(): Promise<CalendarFeedState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("calendar_feeds").select("token").maybeSingle<CalendarFeedRow>();
  if (error || !data) return { enabled: false, token: null };
  return { enabled: true, token: data.token };
}

export type EnableCalendarFeedResult = { ok: true; token: string } | { ok: false };

/**
 * Idempotent: a user who already has a row gets their EXISTING token back
 * unchanged -- enabling an already-enabled feed must never silently
 * rotate the URL out from under every calendar app that already
 * subscribed to it. Only a genuinely absent row gets a freshly generated
 * token inserted. `userId` is the caller's already server-verified
 * Supabase user id (from `getAuthenticatedIdentity()`, see `actions.ts`)
 * -- never trusted from client input, and only actually used for the
 * INSERT's `user_id` column value; the RLS `_insert_own` policy's `with
 * check (user_id = auth.uid())` independently re-verifies it against the
 * request's own session regardless.
 */
export async function enableCalendarFeedForCurrentUser(userId: string): Promise<EnableCalendarFeedResult> {
  const supabase = await createSupabaseServerClient();

  const existing = await supabase.from("calendar_feeds").select("token").maybeSingle<CalendarFeedRow>();
  if (!existing.error && existing.data) return { ok: true, token: existing.data.token };

  const token = generateCalendarFeedToken();
  const { error } = await supabase.from("calendar_feeds").insert({ user_id: userId, token });
  if (error) return { ok: false };
  return { ok: true, token };
}

export type ResetCalendarFeedResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_enabled" | "update_failed" };

/**
 * Rotates the current user's token in place -- the previous token stops
 * resolving to anything the instant this commits (the ICS route looks
 * rows up by exact token match, so the old value is simply no longer
 * found), while the row's identity/history stays the same row. Fails with
 * `"not_enabled"` (never silently creates a row) when the user has no
 * existing feed -- "reset" is only ever offered in the UI once sync is
 * already on.
 */
export async function resetCalendarFeedForCurrentUser(userId: string): Promise<ResetCalendarFeedResult> {
  const supabase = await createSupabaseServerClient();
  const token = generateCalendarFeedToken();

  const { data, error } = await supabase
    .from("calendar_feeds")
    .update({ token, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("token")
    .maybeSingle<CalendarFeedRow>();

  if (error) return { ok: false, reason: "update_failed" };
  if (!data) return { ok: false, reason: "not_enabled" };
  return { ok: true, token: data.token };
}

/**
 * Deletes the current user's feed row outright -- "disable" REVOKES the
 * feed completely (PR spec §4), not merely a soft flag, so the previous
 * URL stops resolving to anything at all rather than staying valid but
 * quiesced. Best-effort/idempotent, same as
 * `deletePushSubscriptionForCurrentUser`: whether or not a row actually
 * existed, the caller ends up with no active feed either way.
 */
export async function disableCalendarFeedForCurrentUser(userId: string): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("calendar_feeds").delete().eq("user_id", userId);
  return { ok: !error };
}
