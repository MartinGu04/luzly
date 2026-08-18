import "server-only";
import { cache } from "react";
import { loadShiftFairnessReadModel, type ShiftFairnessLoadResult } from "./shiftFairness";

/** Request-scoped memoization of `loadShiftFairnessReadModel()`, via React's `cache()` -- same convention as `getRequestManagerFairness`. */
export const getRequestShiftFairness = cache(
  (month: string | null): Promise<ShiftFairnessLoadResult> => loadShiftFairnessReadModel(month),
);
