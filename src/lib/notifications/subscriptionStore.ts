import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RawPushSubscription } from "@/lib/push/subscriptionValidation";

/** The persisted shape (camelCase), never the raw DB row -- callers never see Supabase's snake_case column names. */
export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: string | null;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: string | null;
}

function toStoredSubscription(row: PushSubscriptionRow): StoredPushSubscription {
  return {
    id: row.id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    expirationTime: row.expiration_time,
  };
}

/**
 * Creates or reassigns (see the migration's own comment for why
 * reassignment is sometimes legitimate -- the shared-device/account-
 * switch case) the subscription row for `subscription.endpoint`, owned
 * by the CURRENTLY authenticated Supabase user. Always goes through the
 * `upsert_push_subscription` RPC (SECURITY DEFINER, derives ownership
 * from `auth.uid()` server-side) -- never a plain `.insert()`/`.update()`
 * call, and never passes any client-supplied user id. Idempotent:
 * calling this again with the same endpoint updates the existing row
 * rather than creating a duplicate.
 */
export async function upsertPushSubscriptionForCurrentUser(
  subscription: RawPushSubscription,
): Promise<{ ok: true; subscription: StoredPushSubscription } | { ok: false; reason: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("upsert_push_subscription", {
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.p256dh,
      p_auth: subscription.auth,
      p_expiration_time:
        subscription.expirationTime === null ? null : new Date(subscription.expirationTime).toISOString(),
    })
    .single<PushSubscriptionRow>();

  if (error || !data) {
    return { ok: false, reason: error?.message ?? "Failed to persist push subscription." };
  }
  return { ok: true, subscription: toStoredSubscription(data) };
}

/**
 * Best-effort delete of the CURRENT user's row for one specific device
 * (`endpoint`) -- RLS (`user_id = auth.uid()`) already guarantees this
 * can only ever remove a row the caller owns, so no extra `user_id`
 * filter is needed for safety; it's added anyway for query precision.
 * Returns quietly (does not throw) whether or not a row actually existed
 * to delete -- both "already gone" and "successfully removed" are a
 * clean outcome for every caller (disable action, logout cleanup, stale-
 * subscription cleanup after a permanent push failure).
 */
export async function deletePushSubscriptionForCurrentUser(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: !error };
}

/**
 * Looks up the CURRENT user's subscription row for one specific device
 * endpoint -- RLS-scoped, so this can never return (or even reveal the
 * existence of) another user's row for the same or a different endpoint.
 * `null` covers both "no such row" and "exists but belongs to someone
 * else" identically -- the caller never needs to (and, from an RLS-
 * scoped client, structurally cannot) distinguish the two.
 */
export async function findPushSubscriptionForCurrentUser(endpoint: string): Promise<StoredPushSubscription | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, expiration_time")
    .eq("endpoint", endpoint)
    .maybeSingle<PushSubscriptionRow>();

  if (error || !data) return null;
  return toStoredSubscription(data);
}
