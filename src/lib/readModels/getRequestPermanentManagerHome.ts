import "server-only";
import { cache } from "react";
import { loadPermanentManagerHomeReadModel } from "./permanentManagerHome";

/**
 * Request-scoped memoization of `loadPermanentManagerHomeReadModel()`, via
 * React's `cache()` -- same convention and safety properties as
 * `getRequestPersonalSchedule`/`getRequestManagerOverview` (reset per
 * request/render, never shared across users or requests).
 */
export const getRequestPermanentManagerHome = cache(loadPermanentManagerHomeReadModel);
