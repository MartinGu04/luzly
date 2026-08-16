import "server-only";
import { cache } from "react";
import { loadRecentDashboardChanges } from "./recentDashboardChanges";

/**
 * Request-scoped memoization (React `cache()`, not `unstable_cache`) --
 * same convention as `getRequestSearchReadModel`/`getRequestPersonalSchedule`.
 * This list is small, per-user, and only as fresh as the notification
 * worker's last settle -- a longer-lived cache would risk showing stale
 * or (worse) another user's data across requests. PR #34's
 * `AppRevalidator` already re-renders the dashboard route periodically
 * and on foreground return, which is what keeps this naturally fresh --
 * no second polling loop here.
 */
export const getRequestRecentDashboardChanges = cache(loadRecentDashboardChanges);
