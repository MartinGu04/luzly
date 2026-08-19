/**
 * Pure URL construction for the personal calendar feed -- no Supabase, no
 * fetch, no server-only APIs, so every platform-specific link shape here
 * is directly unit-testable.
 */

/** The ICS route's own path for a given token -- see `src/app/calendar/[token]/route.ts`. Deliberately placed OUTSIDE `src/app/api` (that directory must not exist at all -- see `src/app/apiSurface.test.ts`), same reasoning as the notification worker's `/internal/notifications/tick`. */
export function calendarFeedPath(token: string): string {
  return `/calendar/${encodeURIComponent(token)}.ics`;
}

/** The full HTTPS URL a calendar client fetches. `origin` must already be the resolved request origin (scheme + host), e.g. from `resolveRequestOrigin`. */
export function calendarFeedHttpsUrl(origin: string, token: string): string {
  return `${origin}${calendarFeedPath(token)}`;
}

/**
 * The `webcal://` form of the same URL -- the scheme Apple Calendar (macOS
 * "Calendar"/iOS "Calendar") registers a direct "subscribe" handler for,
 * so tapping/clicking it opens the native "Add Subscription" sheet
 * immediately instead of just downloading a one-time .ics file the way a
 * plain `https://` link to the same path would in a browser. Only the
 * scheme changes -- token/path are identical, so both URLs authorize the
 * exact same feed.
 */
export function appleCalendarSubscribeUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https:\/\//, "webcal://");
}

/**
 * Google Calendar's documented (if unofficial) "subscribe by URL" deep
 * link: `calendar.google.com/calendar/r?cid=<url-encoded webcal:// URL>`.
 * This is a genuine platform limitation, not a shortcut taken here --
 * Google Calendar has no equivalent one-tap "Add to Google Calendar"
 * flow for an arbitrary private ICS URL the way Apple's `webcal://`
 * scheme provides; `cid=` is the closest reliable equivalent, and it
 * reliably opens Google Calendar's own "Add by URL" confirmation on
 * desktop web. On the Google Calendar MOBILE app this link does not
 * reliably deep-link the same way (a documented Google-side limitation) --
 * the safest reliable fallback for a mobile visitor is "Copy Link" plus
 * pasting it into Google Calendar's own Settings -> Add calendar -> From
 * URL screen, which always works regardless of platform.
 */
export function googleCalendarSubscribeUrl(httpsUrl: string): string {
  const webcalUrl = appleCalendarSubscribeUrl(httpsUrl);
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
}

/**
 * Resolves the request's own scheme+host from already-extracted header
 * values -- split out from any `next/headers` call so the actual
 * host/proto -> origin logic is independently testable without a Next.js
 * request context. `forwardedHost`/`forwardedProto` (from
 * `x-forwarded-host`/`x-forwarded-proto`) take priority, matching how
 * every proxy/CDN in front of a Vercel deployment actually reports the
 * original request; `host` is the plain fallback for direct/local access.
 * Local hosts (`localhost`/`127.0.0.1`) default to `http` when no
 * forwarded proto is present -- everything else defaults to `https`,
 * since this app is never intentionally served over plain HTTP in any
 * real deployment.
 */
export function resolveOriginFromHeaders(
  host: string | null,
  forwardedHost: string | null,
  forwardedProto: string | null,
): string | null {
  const effectiveHost = forwardedHost ?? host;
  if (!effectiveHost) return null;

  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(effectiveHost);
  const protocol = forwardedProto ?? (isLocal ? "http" : "https");
  return `${protocol}://${effectiveHost}`;
}

export interface CalendarFeedLinks {
  /** The plain HTTPS feed URL -- what "Copy Link" puts on the clipboard. */
  url: string;
  /** `calendar.google.com/calendar/r?cid=...` deep link -- see `googleCalendarSubscribeUrl`'s own docstring for its platform limitation. */
  googleUrl: string;
  /** `webcal://` form -- see `appleCalendarSubscribeUrl`. */
  appleUrl: string;
}

/** The one place all three feed-related links are built together from `(origin, token)` -- reused by both the settings page's initial server render and every mutating action's response, so they can never drift apart. */
export function buildCalendarFeedLinks(origin: string, token: string): CalendarFeedLinks {
  const url = calendarFeedHttpsUrl(origin, token);
  return { url, googleUrl: googleCalendarSubscribeUrl(url), appleUrl: appleCalendarSubscribeUrl(url) };
}
