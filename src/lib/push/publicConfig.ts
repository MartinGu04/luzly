import "client-only";

/** Thrown when the public VAPID key isn't configured -- caught by the notification UI, never crashes the app. */
export class VapidPublicConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VapidPublicConfigError";
  }
}

/**
 * The public VAPID key only -- safe to ship to the browser by design (see
 * `config.ts`'s docstring for the full public/private split). Client-safe
 * only (the `client-only` import fails an accidental server import at
 * build time) so it can never be confused with the server-only full
 * config that includes the private key.
 */
export function getVapidPublicKey(): string {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new VapidPublicConfigError("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.");
  }
  return publicKey;
}
