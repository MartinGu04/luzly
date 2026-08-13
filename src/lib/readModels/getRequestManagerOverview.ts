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
 * never compare equal even with identical field values.
 */
export const getRequestManagerOverview = cache(
  (
    personId: string | null,
    range: Parameters<typeof loadManagerOverviewReadModel>[0]["range"],
    month: string | null,
    problemsOnly: boolean,
  ): Promise<ManagerOverviewLoadResult> =>
    loadManagerOverviewReadModel({ personId, range, month, problemsOnly }),
);
