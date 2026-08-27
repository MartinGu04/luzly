import "server-only";
import { cache } from "react";
import { loadEmergencyFairnessReadModel, type EmergencyFairnessLoadResult } from "./emergencyFairnessLoader";

/** Request-scoped memoization of `loadEmergencyFairnessReadModel()`, via React's `cache()` -- same convention as `getRequestShiftFairness`/`getRequestDutyFairness`. */
export const getRequestEmergencyFairness = cache((): Promise<EmergencyFairnessLoadResult> => loadEmergencyFairnessReadModel());
