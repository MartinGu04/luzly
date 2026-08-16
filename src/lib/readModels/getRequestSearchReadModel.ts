import "server-only";
import { cache } from "react";
import { loadSearchReadModel } from "./search";

/** Request-scoped memoization (React `cache()`, not `unstable_cache`) -- same convention as `getRequestPersonalSchedule`. */
export const getRequestSearchReadModel = cache(loadSearchReadModel);
