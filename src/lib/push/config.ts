import "server-only";

export interface VapidServerConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Thrown when VAPID isn't configured -- caught at each call site so a missing/incomplete config fails ONE request gracefully, never the build. */
export class VapidConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VapidConfigError";
  }
}

/**
 * Reads the full server-side VAPID configuration -- including the PRIVATE
 * key, so this must only ever be imported from server-only code (the
 * `server-only` import above turns an accidental client import into a
 * build error). Never validated at module load, only when actually
 * needed to send a push (see `sendPush.ts`) -- so `next build`, and every
 * unrelated route, succeeds whether or not VAPID is configured yet. A
 * user who presses "הפעל התראות"/"שלח התראת בדיקה" before VAPID is set up
 * gets a clean, caught `VapidConfigError` from the relevant Server
 * Action, not a crash.
 *
 * `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are plain server env vars (no
 * `NEXT_PUBLIC_` prefix, same convention as `GOOGLE_PRIVATE_KEY` in
 * `lib/google`) -- they must never reach a browser bundle.
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is intentionally public (see
 * `publicConfig.ts`) and is read again here because `web-push`'s
 * `setVapidDetails` needs BOTH keys together server-side.
 */
export function readVapidServerConfig(): VapidServerConfig {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  const missing = [
    !publicKey && "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    !privateKey && "VAPID_PRIVATE_KEY",
    !subject && "VAPID_SUBJECT",
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0 || !publicKey || !privateKey || !subject) {
    throw new VapidConfigError(`Missing Web Push (VAPID) configuration: ${missing.join(", ")}.`);
  }

  return { publicKey, privateKey, subject };
}
