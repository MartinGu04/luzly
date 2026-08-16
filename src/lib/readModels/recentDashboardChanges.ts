import "server-only";
import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { getRecentSettledJobsForRecipient, type RecentSettledJobRow } from "@/lib/notifications/engine/store";
import type { RecentDashboardChange, RecentDashboardChangeCategory } from "./recentDashboardChangesTypes";

/**
 * A bounded "what recently changed?" horizon -- a small dashboard recap,
 * never a notification archive. These two constants are the ONLY place
 * the 72h/3-item shape is decided; nothing else in this file hardcodes a
 * duration or count.
 */
export const RECENT_DASHBOARD_CHANGES_HORIZON_HOURS = 72;
export const RECENT_DASHBOARD_CHANGES_LIMIT = 3;

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

/**
 * Server-only orchestration for the dashboard's "מה השתנה" recap.
 * Deliberately does NOT re-diff the workbook: the notification engine
 * (PR #30) has already captured a baseline, computed semantic facts,
 * detected changes, debounced them through the quiet period, and settled
 * genuine ones into durable `notification_jobs` rows -- this reuses that
 * outbox as the single source of truth for "did anything real happen?"
 * rather than building a second baseline/diff system, and never calls
 * Google Sheets itself.
 *
 * Resolves the authenticated user independently (the same "re-verify,
 * don't thread an already-narrowed read model across boundaries" pattern
 * `loadSearchReadModel`/`loadScheduleReadModel` already use) and queries
 * ONLY that user's own rows (`recipient_user_id === identity.userId`) --
 * never a client-supplied recipient id, and never through anything but
 * the notification engine's own service-role-gated store layer: RLS on
 * `notification_jobs` is default-deny with zero policies, so there is no
 * other way for a browser-authenticated request to read it at all.
 *
 * `now` defaults to the real current instant; tests pass a fixed value
 * for determinism (same default-parameter convention as
 * `getJerusalemLocalNow`).
 *
 * Never throws: an infra/config failure here (e.g. a missing service-role
 * key) must never take down the personal dashboard, which stays more
 * important than this optional recap -- caught and logged (a fixed,
 * PII-safe string, matching the notification worker's own `console.error`
 * convention), degrading to an empty list, which `RecentChangesPanel`
 * already renders as nothing at all.
 */
export async function loadRecentDashboardChanges(now: Date = new Date()): Promise<RecentDashboardChange[]> {
  try {
    const identity = await getAuthenticatedIdentity();
    if (identity.status !== "authenticated") return [];

    const sinceIso = new Date(now.getTime() - RECENT_DASHBOARD_CHANGES_HORIZON_HOURS * 60 * 60_000).toISOString();
    const rows = await getRecentSettledJobsForRecipient(
      identity.userId,
      Object.keys(PERSONAL_CHANGE_CATEGORIES),
      sinceIso,
      RECENT_DASHBOARD_CHANGES_LIMIT,
    );

    const changes: RecentDashboardChange[] = [];
    for (const row of rows) {
      const change = toRecentDashboardChange(row);
      if (change) changes.push(change);
    }
    return changes;
  } catch {
    console.error("[dashboard] recent changes query failed");
    return [];
  }
}
