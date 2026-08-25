import "server-only";
import { cache } from "react";
import { loadDashboardVisitRecap } from "./recentDashboardChanges";

/**
 * Request-scoped memoization (React `cache()`, not `unstable_cache`) --
 * same convention as `getRequestSearchReadModel`/`getRequestPersonalSchedule`.
 * This recap is small, per-user, and only as fresh as the notification
 * worker's last settle -- a longer-lived cache would risk showing stale
 * or (worse) another user's data across requests. PR #34's
 * `AppRevalidator` already re-renders the dashboard route periodically
 * and on foreground return, which is what keeps this naturally fresh --
 * no second polling loop here. Deliberately request-scoped ONLY: it must
 * never persist across requests, since that's exactly the kind of
 * caching that would risk advancing (or leaking) one user's visit state
 * into another's render.
 */
export const getRequestDashboardVisitRecap = cache(loadDashboardVisitRecap);
