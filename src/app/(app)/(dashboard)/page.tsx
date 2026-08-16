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
 */
export default async function DashboardPage() {
  const result = await getRequestPersonalSchedule();

  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const recentChanges = await getRequestRecentDashboardChanges();

  return <Dashboard model={result.model} recentChanges={recentChanges} />;
}
