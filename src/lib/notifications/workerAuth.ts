import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Thrown when `NOTIFICATION_WORKER_SECRET` is missing/empty. */
export class NotificationWorkerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationWorkerConfigError";
  }
}

function readWorkerSecret(): string {
  const secret = process.env.NOTIFICATION_WORKER_SECRET;
  if (!secret || secret.trim() === "") {
    throw new NotificationWorkerConfigError("Missing Supabase configuration: NOTIFICATION_WORKER_SECRET.");
  }
  return secret;
}

/**
 * Constant-time comparison of the request's `Authorization: Bearer
 * <secret>` header against `NOTIFICATION_WORKER_SECRET`. Never a plain
 * `===` string comparison -- that leaks timing information proportional
 * to the matching prefix length, letting a network attacker recover the
 * secret byte-by-byte. `timingSafeEqual` itself requires equal-length
 * buffers, so an unequal length is rejected immediately (a length
 * mismatch reveals nothing useful about the secret's content).
 *
 * Fails closed on every malformed input: missing header, wrong scheme,
 * empty token, or a misconfigured (missing) server secret are all just
 * "unauthorized" -- never a distinguishable error that could help a
 * caller narrow down which case they hit.
 */
export function isAuthorizedWorkerRequest(authorizationHeader: string | null): boolean {
  if (!authorizationHeader) return false;

  const match = /^Bearer (.+)$/.exec(authorizationHeader);
  if (!match) return false;

  const provided = match[1];

  let expected: string;
  try {
    expected = readWorkerSecret();
  } catch {
    return false;
  }

  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
