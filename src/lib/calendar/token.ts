import "server-only";
import { randomBytes } from "node:crypto";

/**
 * A cryptographically strong, URL-safe private feed token -- 256 bits of
 * `crypto.randomBytes` (Node's CSPRNG), base64url-encoded (no padding, no
 * characters that need escaping in a URL path segment). Unguessable by
 * construction: this is the ONLY thing that authorizes
 * `GET /calendar/<token>.ics` (see `src/app/calendar/[token]/route.ts`),
 * since an external calendar client can never present our normal
 * Supabase session cookie.
 */
export function generateCalendarFeedToken(): string {
  return randomBytes(32).toString("base64url");
}
