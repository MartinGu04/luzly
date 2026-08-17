import { Dashboard } from "@/components/dashboard/Dashboard";
import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import { getRequestPersonalSchedule } from "@/lib/readModels/getRequestPersonalSchedule";
import { getRequestRecentDashboardChanges } from "@/lib/readModels/getRequestRecentDashboardChanges";

/**
 * By the time this page renders, the protected layout has already gated
 * unauthenticated/unmapped/missing_email/ambiguous_identity visitors --
 * only `ok` and `configuration_error` can reach here. Calling
 * `getRequestPersonalSchedule()` again reuses the SAME request-scoped
 * result the layout already computed (React `cache()`), so this performs
 * no additional Google request.
 *
 * `getRequestRecentDashboardChanges()` (PR #36's "מה השתנה" recap) is a
 * SEPARATE, optional call -- it never throws (see its own docstring), so
 * a failure there can never turn this page into `ConfigurationErrorState`;
 * the personal schedule stays the page's one load-bearing dependency.
 *
 * Deliberately still awaited AFTER `result`, not in parallel: unlike the
 * protected layout's own `Promise.all` (PR #38), this second call is
 * skipped entirely whenever `result.status !== "ok"` -- a broken shift
 * configuration has nothing worth recapping, so this never spends an
 * extra Supabase round trip finding that out. See this file's own test
 * ("never fetches recent changes at all when the personal schedule itself
 * failed") for the behavior this preserves.
 */
export default async function DashboardPage() {
  const result = await getRequestPersonalSchedule();

  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const recentChanges = await getRequestRecentDashboardChanges();

  return <Dashboard model={result.model} recentChanges={recentChanges} />;
}
