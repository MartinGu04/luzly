import "server-only";
import { cache } from "react";
import { loadPersonalScheduleReadModel } from "./personalSchedule";

/**
 * Request-scoped memoization of `loadPersonalScheduleReadModel()`, via
 * React's `cache()` -- the standard Server Components primitive for
 * deduplicating a call within a single render pass.
 *
 * Both the protected `(app)` layout (identity/shell) and the dashboard page
 * (content) need the same authenticated person's schedule on every normal
 * request. Without this, a normal request would perform TWO Google reads:
 * the layout's identity check and the page's own load. `cache()` ensures
 * they share exactly one in-flight/resolved call.
 *
 * Safety properties this relies on, and that must never regress:
 * - `cache()` memoization is scoped to a single request's render tree only
 *   -- it is reset for every new request/render, never shared across users
 *   or across requests. This is NOT `unstable_cache` (which persists across
 *   requests) and NOT a module-level variable (which would leak between
 *   requests on a warm server instance).
 * - No arguments are accepted here on purpose: the wrapped function reads
 *   the authenticated identity itself from the request's own cookies via
 *   `getAuthenticatedIdentity()`, so there is no way to pass in -- or
 *   accidentally reuse -- another user's identity/result.
 */
export const getRequestPersonalSchedule = cache(loadPersonalScheduleReadModel);
