import "server-only";
import { cache } from "react";
import { loadManagerFairnessReadModel, type ManagerFairnessLoadResult } from "./managerFairness";

/**
 * Request-scoped memoization of `loadManagerFairnessReadModel()`, via
 * React's `cache()` -- same convention as `getRequestManagerOverview`.
 * Takes primitive params (not one object) so `cache()`'s per-argument
 * identity comparison actually dedupes multiple Server Components on the
 * same `/manager/fairness` render.
 */
export const getRequestManagerFairness = cache(
  (period: string | null, personId: string | null): Promise<ManagerFairnessLoadResult> =>
    loadManagerFairnessReadModel({ period, personId }),
);
