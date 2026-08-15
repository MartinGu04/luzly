"use server";

import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { buildNotificationPayload, TEST_NOTIFICATION_PAYLOAD } from "@/lib/push/payload";
import { sendPush } from "@/lib/push/sendPush";
import { parseBrowserSubscription } from "@/lib/push/subscriptionValidation";
import {
  deletePushSubscriptionForCurrentUser,
  findPushSubscriptionForCurrentUser,
  upsertPushSubscriptionForCurrentUser,
} from "./subscriptionStore";

export type EnablePushResult = { ok: true } | { ok: false; error: string };

/**
 * Persists a browser `PushSubscription` for the authenticated user --
 * the ONLY server boundary that ever writes a `push_subscriptions` row.
 * Called after the client has already: (1) gotten explicit user consent
 * via the "הפעל התראות" click, (2) requested and received `"granted"`
 * Notification permission from THAT click, and (3) created/reused the
 * browser-level subscription. This action itself never requests
 * permission or talks to the push service -- it only validates and
 * persists.
 *
 * Fails closed: an unauthenticated caller or malformed subscription JSON
 * is rejected before ever reaching the database. Idempotent via the
 * underlying `upsert_push_subscription` RPC (see
 * `subscriptionStore.ts`/the migration) -- calling this again for the
 * same device never creates a duplicate row.
 */
export async function enablePushNotificationsAction(rawSubscription: unknown): Promise<EnablePushResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") {
    return { ok: false, error: "not_authenticated" };
  }

  const parsed = parseBrowserSubscription(rawSubscription);
  if (!parsed.ok) {
    return { ok: false, error: "invalid_subscription" };
  }

  const result = await upsertPushSubscriptionForCurrentUser(parsed.subscription);
  if (!result.ok) {
    return { ok: false, error: "persist_failed" };
  }
  return { ok: true };
}

export interface DisablePushResult {
  ok: boolean;
}

/**
 * Removes the CURRENT device's subscription row for the authenticated
 * user. Best-effort/idempotent by design: whether or not a row actually
 * existed, the device ends up not subscribed either way -- see
 * `deletePushSubscriptionForCurrentUser`'s own docstring.
 */
export async function disablePushNotificationsAction(endpoint: string): Promise<DisablePushResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false };
  if (typeof endpoint !== "string" || endpoint.length === 0) return { ok: false };

  return deletePushSubscriptionForCurrentUser(endpoint);
}

export interface PushSubscriptionStatus {
  subscribed: boolean;
}

/**
 * Whether THIS specific device (`endpoint`) has an active, server-
 * persisted subscription for the currently authenticated user --
 * deliberately NOT "does the browser have a PushSubscription object" and
 * NOT "does `Notification.permission` say granted" (see
 * `components/pwa/usePushSubscription.ts`'s docstring for why neither
 * alone is trustworthy, especially across an account switch on a shared
 * device). `endpoint === null` (no local browser subscription at all)
 * short-circuits to `false` without a network round trip.
 */
export async function getPushSubscriptionStatusAction(endpoint: string | null): Promise<PushSubscriptionStatus> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { subscribed: false };
  if (!endpoint) return { subscribed: false };

  const stored = await findPushSubscriptionForCurrentUser(endpoint);
  return { subscribed: stored !== null };
}

export type SendTestNotificationResult = { ok: true } | { ok: false; error: string };

/**
 * Sends PR #29's real end-to-end test push -- through the same
 * `lib/push` pipeline any future automated notification will use, never
 * a fake directly-constructed browser notification. `endpoint` is ALWAYS re-verified
 * server-side as belonging to the authenticated caller
 * (`findPushSubscriptionForCurrentUser`, RLS-scoped) before anything is
 * sent -- a client can never use this to push to a device it doesn't
 * own, even if it somehow knew that device's endpoint string.
 *
 * A permanently-invalid push response (see `sendPush`'s classification)
 * removes the stale row here too, same as any future real notification
 * send would -- this path is not a special case.
 */
export async function sendTestNotificationAction(endpoint: string): Promise<SendTestNotificationResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false, error: "not_authenticated" };
  if (typeof endpoint !== "string" || endpoint.length === 0) return { ok: false, error: "invalid_endpoint" };

  const stored = await findPushSubscriptionForCurrentUser(endpoint);
  if (!stored) return { ok: false, error: "not_subscribed" };

  const payload = buildNotificationPayload(TEST_NOTIFICATION_PAYLOAD);
  const result = await sendPush({ endpoint: stored.endpoint, p256dh: stored.p256dh, auth: stored.auth }, payload);

  if (!result.ok) {
    if (result.permanent) {
      await deletePushSubscriptionForCurrentUser(endpoint).catch(() => {});
    }
    return { ok: false, error: result.permanent ? "subscription_expired" : "send_failed" };
  }
  return { ok: true };
}
