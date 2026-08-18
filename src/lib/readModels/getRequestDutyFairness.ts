import "server-only";
import { cache } from "react";
import { loadDutyFairnessReadModel, type DutyFairnessLoadResult } from "./dutyFairness";

/** Request-scoped memoization of `loadDutyFairnessReadModel()`, via React's `cache()` -- same convention as `getRequestManagerFairness`. */
export const getRequestDutyFairness = cache(
  (period: string | null): Promise<DutyFairnessLoadResult> => loadDutyFairnessReadModel(period),
);
