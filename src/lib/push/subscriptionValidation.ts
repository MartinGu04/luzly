import "server-only";

/** The exact shape persisted/sent to `web-push` -- never the full, larger browser `PushSubscriptionJSON`. */
export interface RawPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
}

export type SubscriptionValidationResult =
  | { ok: true; subscription: RawPushSubscription }
  | { ok: false; reason: string };

/**
 * A real push `p256dh` key (uncompressed EC point, 65 bytes) is 87
 * URL-safe-base64 characters unpadded; `auth` (16 random bytes) is 22.
 * These bounds are intentionally loose (not exact-length asserts) --
 * different browsers/push services have historically varied slightly in
 * padding/encoding -- but wildly short/long values are always rejected
 * as a basic shape sanity check, not full cryptographic validation.
 */
const P256DH_MIN_LENGTH = 40;
const AUTH_MIN_LENGTH = 10;
const MAX_REASONABLE_LENGTH = 500;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function isReasonableBase64Url(value: unknown, minLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= minLength &&
    value.length <= MAX_REASONABLE_LENGTH &&
    BASE64URL_PATTERN.test(value)
  );
}

/**
 * Validates and narrows arbitrary, untrusted client-submitted JSON into a
 * `RawPushSubscription` -- fails closed on anything malformed (missing
 * fields, wrong types, an unreasonable-looking key). Never throws; the
 * caller (a Server Action) always gets an explicit ok/reason result to
 * act on and never has to guess why a request was rejected.
 */
export function parseBrowserSubscription(raw: unknown): SubscriptionValidationResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "Subscription must be an object." };
  }

  const candidate = raw as Record<string, unknown>;
  const endpoint = candidate.endpoint;
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2000) {
    return { ok: false, reason: "Missing or invalid endpoint." };
  }
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return { ok: false, reason: "Endpoint is not a valid URL." };
  }
  if (endpointUrl.protocol !== "https:") {
    return { ok: false, reason: "Endpoint must be an https:// URL." };
  }

  const keys = candidate.keys;
  if (typeof keys !== "object" || keys === null) {
    return { ok: false, reason: "Missing encryption keys." };
  }
  const { p256dh, auth } = keys as Record<string, unknown>;
  if (!isReasonableBase64Url(p256dh, P256DH_MIN_LENGTH)) {
    return { ok: false, reason: "Missing or invalid p256dh key." };
  }
  if (!isReasonableBase64Url(auth, AUTH_MIN_LENGTH)) {
    return { ok: false, reason: "Missing or invalid auth key." };
  }

  const expirationTimeRaw = candidate.expirationTime;
  const expirationTime =
    typeof expirationTimeRaw === "number" && Number.isFinite(expirationTimeRaw) ? expirationTimeRaw : null;
  if (expirationTimeRaw != null && expirationTime === null) {
    return { ok: false, reason: "Invalid expirationTime." };
  }

  return {
    ok: true,
    subscription: { endpoint, p256dh, auth, expirationTime },
  };
}
