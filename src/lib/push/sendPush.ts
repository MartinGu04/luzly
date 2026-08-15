import "server-only";
import { WebPushError, sendNotification, setVapidDetails } from "web-push";
import { VapidConfigError, readVapidServerConfig } from "./config";
import { serializeNotificationPayload, type NotificationPayload } from "./payload";

/** The minimal subscription shape `web-push` needs -- never the full stored row (no id/user_id/timestamps). */
export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushSendResult =
  | { ok: true }
  | { ok: false; permanent: boolean; statusCode?: number; message: string };

/**
 * A push endpoint reporting 404 (Not Found) or 410 (Gone) is the push
 * service itself telling us the subscription is permanently dead --
 * per the Web Push protocol (RFC 8030) and every major provider's (FCM,
 * Mozilla) documented behavior. Everything else (429 rate limit, 5xx,
 * network/timeout errors) is treated as TRANSIENT -- never a reason to
 * delete a subscription a device may still legitimately want.
 */
const PERMANENTLY_INVALID_STATUS_CODES = new Set([404, 410]);

let vapidConfigured = false;

/** Configures `web-push`'s VAPID details exactly once per process -- `setVapidDetails` itself has no idempotency guard, so this avoids redundant calls on every send. */
function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  const { publicKey, privateKey, subject } = readVapidServerConfig();
  setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

/**
 * Sends exactly one Web Push message and classifies the outcome so every
 * caller -- this PR's test-push action, and any future automated
 * notification type -- inherits the SAME permanent-vs-transient failure
 * handling from one place, per PR #29's requirement. Callers decide what
 * to do with a `permanent: true` failure (typically: delete the stale
 * subscription); this function only sends and classifies, it never
 * touches Supabase itself, keeping this module a pure push-mechanics
 * layer.
 *
 * Never logs the subscription's endpoint/keys or the payload's title/body
 * -- only a generic outcome label and HTTP status code, matching this
 * codebase's existing PII-safe logging convention (see
 * `lib/config/timingDiagnostics.ts`).
 */
export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: NotificationPayload,
): Promise<PushSendResult> {
  try {
    ensureVapidConfigured();
  } catch (error) {
    if (error instanceof VapidConfigError) {
      return { ok: false, permanent: false, message: error.message };
    }
    throw error;
  }

  try {
    await sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      serializeNotificationPayload(payload),
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof WebPushError) {
      const permanent = PERMANENTLY_INVALID_STATUS_CODES.has(error.statusCode);
      console.error(`[push] send failed: status=${error.statusCode} permanent=${permanent}`);
      return {
        ok: false,
        permanent,
        statusCode: error.statusCode,
        message: "Push endpoint rejected the message.",
      };
    }
    console.error("[push] send failed: transient/network error");
    return { ok: false, permanent: false, message: "Transient error sending push notification." };
  }
}
