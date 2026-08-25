import "server-only";
import { cache } from "react";
import { loadReportOneTomorrow } from "./reportOneTomorrow";

/**
 * Request-scoped memoization of `loadReportOneTomorrow()`, via React's
 * `cache()` -- same convention as `getRequestPermanentManagerHome`.
 */
export const getRequestReportOneTomorrow = cache(loadReportOneTomorrow);
