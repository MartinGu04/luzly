import { Dashboard } from "@/components/dashboard/Dashboard";
import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import { PermanentManagerHome } from "@/components/home/PermanentManagerHome";
import { getCalendarFeedForCurrentUser } from "@/lib/calendar/feedStore";
import { classifyPersonnelType } from "@/lib/domain/personnelType";
import { getRequestPermanentManagerHome } from "@/lib/readModels/getRequestPermanentManagerHome";
import { getRequestPersonalSchedule } from "@/lib/readModels/getRequestPersonalSchedule";
import { getRequestDashboardVisitRecap } from "@/lib/readModels/getRequestRecentDashboardChanges";
import { getRequestReportOneTomorrow } from "@/lib/readModels/getRequestReportOneTomorrow";

/**
 * By the time this page renders, the protected layout has already gated
 * unauthenticated/unmapped/missing_email/ambiguous_identity visitors --
 * only `ok` and `configuration_error` can reach here. Calling
 * `getRequestPersonalSchedule()` again reuses the SAME request-scoped
 * result the layout already computed (React `cache()`), so this performs
 * no additional Google request.
 *
 * `getRequestDashboardVisitRecap()` (originally PR #36's "מה השתנה"
 * recap, upgraded into a true "since your previous Home visit" recap) is
 * a SEPARATE, optional call -- it never throws (see its own docstring),
 * so a failure there can never turn this page into `ConfigurationErrorState`;
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
 * The visit recap is ALSO explicitly gated here to regular (`חובה`) and
 * reserve (`מילואים`) personnel ONLY -- `classifyPersonnelType(...)`,
 * re-checked from the already-authenticated `result.model.person`, is
 * the ONE place that decides eligibility for this feature. Permanent
 * staff never see it (managers already have their own separate
 * `PermanentManagerHome`, but this gate does not rely on that alone --
 * a non-manager permanent person reaching the normal Dashboard below
 * still must not get this recap) and unclassified personnel never see
 * it either. An ineligible person never even triggers
 * `getRequestDashboardVisitRecap()` -- no wasted Supabase round trip for
 * a recap that would never render anyway.
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
 *
 * "דוח 1 למחר" (Report 1) Home quick action: authorized to EVERY manager
 * (`result.model.person.isManager === true`), never only permanent managers
 * -- `getRequestReportOneTomorrow()` itself re-proves that exact boundary
 * (see its own docs), this is just which Home surface renders the
 * already-authorized draft. A permanent manager gets it on
 * `PermanentManagerHome`; any other manager (regular/reserve, e.g. a
 * shift-working אחמ"ש with manager access) gets it on the normal `Dashboard`
 * instead -- never a separate nav destination either way. A non-manager
 * never triggers `getRequestReportOneTomorrow()` at all.
 *
 * `getCalendarFeedForCurrentUser()` (nav redesign pass, "השלמת הגדרה" setup
 * card) is fetched once here, unconditionally, and threaded to whichever
 * Home surface below ends up rendering -- the SAME authoritative
 * enabled/disabled signal `/settings` itself renders from, never
 * re-derived. Cheap (a single RLS-scoped row read) and independent of the
 * personal-schedule/manager-home data above, so it costs nothing extra to
 * always fetch it once real content is about to render.
 */
export default async function DashboardPage() {
  const result = await getRequestPersonalSchedule();

  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const calendarSyncEnabled = (await getCalendarFeedForCurrentUser()).enabled;

  const isPermanentManager =
    classifyPersonnelType(result.model.person.personnelType) === "permanent" && result.model.person.isManager;

  if (isPermanentManager) {
    const homeResult = await getRequestPermanentManagerHome();
    if (homeResult.status === "ok") {
      const reportOneResult = await getRequestReportOneTomorrow();
      const reportOneDraft = reportOneResult.status === "ok" ? reportOneResult.draft : null;
      const reportOneReserveInclusion = reportOneResult.status === "ok" ? reportOneResult.reserveInclusionByPersonId : undefined;
      return (
        <PermanentManagerHome
          model={homeResult.model}
          reportOneDraft={reportOneDraft}
          reportOneReserveInclusion={reportOneReserveInclusion}
          userId={result.userId}
          calendarSyncEnabled={calendarSyncEnabled}
        />
      );
    }
  }

  const serviceCategory = classifyPersonnelType(result.model.person.personnelType);
  const isVisitRecapEligible = serviceCategory === "regular" || serviceCategory === "reserve";

  const visitRecap = isVisitRecapEligible ? await getRequestDashboardVisitRecap() : null;

  const reportOneResult = result.model.person.isManager ? await getRequestReportOneTomorrow() : null;
  const reportOneDraft = reportOneResult?.status === "ok" ? reportOneResult.draft : null;
  const reportOneReserveInclusion = reportOneResult?.status === "ok" ? reportOneResult.reserveInclusionByPersonId : undefined;

  return (
    <Dashboard
      model={result.model}
      visitRecap={visitRecap}
      reportOneDraft={reportOneDraft}
      reportOneReserveInclusion={reportOneReserveInclusion}
      userId={result.userId}
      calendarSyncEnabled={calendarSyncEnabled}
    />
  );
}
