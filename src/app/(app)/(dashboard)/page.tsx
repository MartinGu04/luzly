import { Dashboard } from "@/components/dashboard/Dashboard";
import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import { PermanentManagerHome } from "@/components/home/PermanentManagerHome";
import { classifyPersonnelType } from "@/lib/domain/personnelType";
import { getRequestPermanentManagerHome } from "@/lib/readModels/getRequestPermanentManagerHome";
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
 *
 * Permanent-manager Home routing (post-release feature): ONLY an
 * authenticated person who is BOTH `classifyPersonnelType(...) ===
 * "permanent"` AND `isManager === true` ever sees the department-wide
 * operational snapshot instead of their own personal Dashboard -- checked
 * here, server-side, from the already-authenticated `result.model.person`,
 * never inferred from a client heuristic. `getRequestPermanentManagerHome()`
 * re-proves manager authorization itself (via `loadManagerWorkbookContext`,
 * the same boundary every other manager feature uses) before ever fetching
 * department-wide data -- this gate alone is not what grants that access,
 * it only decides which safe, already-authorized presentation to render.
 * Any non-"ok" result from it (should not normally happen once the personal
 * schedule itself resolved "ok") falls back to the normal Dashboard rather
 * than a worse/error experience, since a working personal read model is
 * already in hand.
 */
export default async function DashboardPage() {
  const result = await getRequestPersonalSchedule();

  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const isPermanentManager =
    classifyPersonnelType(result.model.person.personnelType) === "permanent" && result.model.person.isManager;

  if (isPermanentManager) {
    const homeResult = await getRequestPermanentManagerHome();
    if (homeResult.status === "ok") {
      return <PermanentManagerHome model={homeResult.model} />;
    }
  }

  const recentChanges = await getRequestRecentDashboardChanges();

  return <Dashboard model={result.model} recentChanges={recentChanges} />;
}
