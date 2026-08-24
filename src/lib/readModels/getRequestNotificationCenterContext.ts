import "server-only";
import { cache } from "react";
import { loadNotificationCenterContext, type NotificationCenterContextResult } from "./notificationCenter";

/**
 * Request-scoped memoization of `loadNotificationCenterContext()`, via
 * React's `cache()` -- same convention and safety properties as
 * `getRequestManagerOverview` (reset per request/render, never shared
 * across users or requests, never `unstable_cache`, no module-level
 * state, no persistent cache of authenticated identity).
 *
 * Takes the already-derived `needsRosterAndAdoption` boolean (not the raw
 * `?section=` string) so `cache()`'s per-argument identity comparison
 * dedupes correctly -- a render that needs the roster/readiness projection
 * and one that doesn't (e.g. "היסטוריה") are correctly treated as different
 * requests, never accidentally sharing a memoized result.
 */
export const getRequestNotificationCenterContext = cache(
  (needsRosterAndAdoption: boolean): Promise<NotificationCenterContextResult> =>
    loadNotificationCenterContext(needsRosterAndAdoption),
);
