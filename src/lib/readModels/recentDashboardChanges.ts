import "server-only";
import { getRequestAuthenticatedIdentity } from "@/lib/auth/getRequestAuthenticatedIdentity";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { getLastVisitedAt } from "@/lib/dashboardVisit/store";
import { getRecentSettledJobsForRecipient, type RecentSettledJobRow } from "@/lib/notifications/engine/store";
import type { DashboardVisitRecap, RecentDashboardChange, RecentDashboardChangeCategory } from "./recentDashboardChangesTypes";

/**
 * The bounded PRESENTATION slice for the personal Home dashboard's "מה
 * השתנה מאז הפעם הקודמת" recap -- a small returning-user recap, never a
 * notification wall. This is the ONLY place that decides how many rows
 * are shown; the recap's TIME LOWER BOUND is no longer a constant at
 * all (see this file's own docstring below) -- it is now the
 * authenticated user's own previous Home-visit instant.
 */
export const DASHBOARD_VISIT_RECAP_VISIBLE_LIMIT = 3;

/**
 * Exactly the personal semantic-change categories this recap covers, and
 * the ONLY place that maps a `notification_jobs.category` string to this
 * feature's own `RecentDashboardChangeCategory`. Deliberately excludes
 * `coverage_gap` (manager-only, surfaced in the existing "דורש טיפול"
 * experience instead) and every reminder category (`tomorrow_shift`,
 * `tomorrow_duty`, `tomorrow_logistics_withdrawal`, `constraints_sunday`,
 * `constraints_monday`) -- those describe a future obligation, not a
 * settled change that already happened.
 */
const PERSONAL_CHANGE_CATEGORIES: Record<string, RecentDashboardChangeCategory> = {
  shift_change: "shift",
  team_change: "team",
  duty_change: "duty",
};

const CATEGORY_FALLBACK_HREF: Record<RecentDashboardChangeCategory, string> = {
  shift: "/schedule",
  team: "/",
  duty: "/duties",
};

/**
 * The settled change's own fact key -- `shift:<personId>:<date>`,
 * `team:<personId>:<date>:<period>`, or `duty:<personId>:<date>` (see
 * `lib/notifications/engine/semanticFacts.ts`) -- always carries the
 * affected date as its THIRD colon-separated segment, regardless of
 * category. Never trusted blindly: only a structurally valid calendar
 * date (`parseCalendarDate`) is ever returned, so a malformed/unknown/
 * absent `source_ref` safely yields `null` rather than an unvalidated
 * string ever reaching a URL.
 */
function extractSafeDate(sourceRef: string | null): string | null {
  if (!sourceRef) return null;
  const candidate = sourceRef.split(":")[2];
  if (!candidate) return null;
  return parseCalendarDate(candidate) ? candidate : null;
}

/**
 * shift/team changes get the PR #35 schedule deep link when a safe date
 * is derivable -- that date genuinely exists on the viewer's own
 * `/schedule`, exactly the destination the change is about. Duty changes
 * always reuse the plain `/duties` destination: there is no established
 * date-deep-link mechanism there yet, and inventing one is out of scope
 * for this PR. Every category always resolves to SOME safe destination,
 * so every recap row is actionable -- never a raw/arbitrary path, and
 * never anything other than an already-known in-app route.
 */
function deriveHref(category: RecentDashboardChangeCategory, date: string | null): string {
  if (category === "duty") return CATEGORY_FALLBACK_HREF.duty;
  return date ? `/schedule?date=${date}` : CATEGORY_FALLBACK_HREF[category];
}

function toRecentDashboardChange(row: RecentSettledJobRow): RecentDashboardChange | null {
  const category = PERSONAL_CHANGE_CATEGORIES[row.category];
  if (!category) return null; // defensive only -- the query itself already filters to these categories

  const date = extractSafeDate(row.sourceRef);
  return {
    key: `change:${row.id}`,
    category,
    title: row.title,
    body: row.body,
    happenedAt: row.createdAt,
    href: deriveHref(category, date),
    date,
  };
}

const EMPTY_RECAP_AT = (visitStartedAt: string): DashboardVisitRecap => ({ visitStartedAt, items: [], totalCount: 0 });

/**
 * Server-only orchestration for the personal Home dashboard's "מה השתנה
 * מאז הפעם הקודמת" recap. Upgraded from PR #36's original "recent
 * settled changes from the last 72 hours" into a TRUE "since your
 * previous Home visit" recap: the lower time bound is no longer any
 * fixed horizon at all -- it is the authenticated user's own previous
 * Home-visit instant, persisted server-side (`lib/dashboardVisit/store.ts`)
 * and never localStorage, so it works identically across devices.
 *
 * Deliberately does NOT re-diff the workbook, and deliberately does NOT
 * become a second baseline/semantic-change engine: the notification
 * engine (PR #30) has already captured a baseline, computed semantic
 * facts, detected changes, debounced them through the quiet period, and
 * settled genuine ones into durable `notification_jobs` rows -- this
 * reuses that outbox as the single source of truth for "did anything
 * real happen?", exactly as PR #36 already did, only with a different
 * (per-user, per-visit) lower time bound instead of a shared constant.
 *
 * Resolves the authenticated user independently (the same "re-verify,
 * don't thread an already-narrowed read model across boundaries" pattern
 * `loadSearchReadModel`/`loadScheduleReadModel` already use) and queries
 * ONLY that user's own rows (`recipient_user_id === identity.userId`) --
 * never a client-supplied recipient id, and never through anything but
 * the notification engine's own service-role-gated store layer: RLS on
 * `notification_jobs` is default-deny with zero policies, so there is no
 * other way for a browser-authenticated request to read it at all. The
 * previous-visit cutoff itself is read the same way, through
 * `lib/dashboardVisit/store.ts`'s own separate service-role boundary.
 *
 * CRITICAL ordering, per PR spec section 7: this function only ever
 * READS the previous visit -- it never advances it. The current visit is
 * marked separately, client-side, only after the Home screen has
 * genuinely mounted (`DashboardVisitMarker`) -- never during this server
 * render. `now` (defaulting to the real current instant; tests pass a
 * fixed value for determinism, same convention as `getJerusalemLocalNow`)
 * becomes `visitStartedAt`, captured immediately and returned even on
 * failure -- see PR spec section 8 for why the marker must persist THIS
 * snapshot instant, never a later client-side `Date.now()`: a semantic
 * change could otherwise settle in the gap between this read and the
 * marker's write and be silently treated as "already seen" next time.
 *
 * First-ever visit (no stored previous timestamp): this is the user's
 * baseline. No historical recap is shown -- `items`/`totalCount` stay
 * empty, and NOTHING is queried against `notification_jobs` for it, even
 * though old settled jobs may well exist. Their NEXT visit can
 * legitimately show changes since this baseline, once `DashboardVisitMarker`
 * records it.
 *
 * Never throws: an infra/config failure here (visit-state read, or the
 * changes query itself) must never take down the personal dashboard,
 * which stays more important than this optional recap -- caught and
 * logged (a fixed, PII-safe string, matching the notification worker's
 * own `console.error` convention), degrading to an empty recap, which
 * `RecentChangesPanel` already renders as nothing at all. `visitStartedAt`
 * is still returned in this failure case (it was captured before any
 * fallible call), so the caller can still mount `DashboardVisitMarker`
 * and make forward progress for next time.
 */
export async function loadDashboardVisitRecap(now: Date = new Date()): Promise<DashboardVisitRecap> {
  const visitStartedAt = now.toISOString();

  try {
    // Request-scoped memoized (`getRequestAuthenticatedIdentity`) -- this
    // runs on the SAME dashboard-page render as the protected layout's own
    // `getRequestPersonalSchedule()`, so it shares that one live Supabase
    // `getUser()` check instead of triggering a second one.
    const identity = await getRequestAuthenticatedIdentity();
    if (identity.status !== "authenticated") return EMPTY_RECAP_AT(visitStartedAt);

    const previousVisitedAt = await getLastVisitedAt(identity.userId);
    if (previousVisitedAt === null) {
      // First-ever visit: this IS the baseline -- no historical recap,
      // and no notification_jobs query at all (see this function's own
      // docstring).
      return EMPTY_RECAP_AT(visitStartedAt);
    }

    const { rows, totalCount } = await getRecentSettledJobsForRecipient(
      identity.userId,
      Object.keys(PERSONAL_CHANGE_CATEGORIES),
      previousVisitedAt,
      DASHBOARD_VISIT_RECAP_VISIBLE_LIMIT,
    );

    const items: RecentDashboardChange[] = [];
    for (const row of rows) {
      const change = toRecentDashboardChange(row);
      if (change) items.push(change);
    }
    return { visitStartedAt, items, totalCount };
  } catch {
    console.error("[dashboard] visit recap query failed");
    return EMPTY_RECAP_AT(visitStartedAt);
  }
}
