import "server-only";
import { cache } from "react";
import { loadManagerOverviewReadModel, type ManagerOverviewLoadResult } from "./managerOverview";

/**
 * Request-scoped memoization of `loadManagerOverviewReadModel()`, via
 * React's `cache()` -- same convention and safety properties as
 * `getRequestPersonalSchedule` (reset per request/render, never shared
 * across users or requests, never `unstable_cache`, no module-level
 * state).
 *
 * Takes the already-parsed primitive request params (not one object) so
 * `cache()`'s per-argument identity comparison actually dedupes multiple
 * Server Components on the same `/manager` render that need the same
 * scope -- an object literal built separately at each call site would
 * never compare equal even with identical field values. `needsAdoptionReadiness`
 * and `needsRosterAvatars` are both part of that same cache key (a
 * `boolean` is just as valid a `cache()` argument as a string) -- so a
 * render that needs either and one that doesn't are correctly treated as
 * different requests, never accidentally sharing a memoized result across
 * categories.
 */
export const getRequestManagerOverview = cache(
  (
    personId: string | null,
    range: Parameters<typeof loadManagerOverviewReadModel>[0]["range"],
    month: string | null,
    needsAdoptionReadiness: boolean,
    needsRosterAvatars: boolean,
  ): Promise<ManagerOverviewLoadResult> =>
    loadManagerOverviewReadModel({ personId, range, month }, needsAdoptionReadiness, needsRosterAvatars),
);
