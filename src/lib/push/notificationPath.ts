/**
 * Server-side mirror of `public/sw.js`'s own `resolveSafeNotificationPath`
 * (PR #28) -- kept as a byte-for-byte-equivalent TypeScript port rather
 * than importing `sw.js` directly, since that file must stay a plain,
 * bundler-free static script (see its own header comment: no secrets, no
 * build step). `notificationPath.test.ts` cross-checks this against the
 * real shipped `sw.js` text (loaded via the same `vm` technique
 * `lib/pwa/sw.test.ts` uses) for a battery of inputs, so the two can never
 * silently drift apart.
 *
 * Used server-side when building an outgoing push payload (`payload.ts`)
 * so the server never even SENDS an unsafe path -- defense in depth
 * alongside the Service Worker's own client-side check at display time.
 */
const SAFE_IN_APP_PATH_PATTERN = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/;

export function resolveSafeNotificationPath(rawPath: string | null | undefined): string {
  if (typeof rawPath !== "string") return "/";
  if (!rawPath.startsWith("/")) return "/";
  if (rawPath.startsWith("//")) return "/"; // protocol-relative -- would escape same-origin
  if (!SAFE_IN_APP_PATH_PATTERN.test(rawPath)) return "/";
  return rawPath;
}
