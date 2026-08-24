import type { ManagerRangeKey } from "@/lib/domain/dateRange";

/**
 * The Manager Area's top-level categories (redesign, PR follow-up to #14/
 * #21/#37/#40) -- "סקירה" (Overview) is the default command-center view,
 * omitted from the URL like every other "default" param this app already
 * omits (`FairnessMode`'s `shifts`, `DutyView`'s `upcoming`). The next
 * three each own one previously-scattered slice of the old single long
 * page: "משמרות" (coverage + Potential reconciliation), "כוח אדם" (roster
 * + person drill-down), "תורנויות והיעדרויות" (cross-team duties/absences).
 * "התחברויות" is a management-visibility category, not operational data: it
 * reconciles the same roster against Supabase auth/push-subscription state
 * to show login/notification-readiness adoption -- see `ManagerAdoptionView`.
 * Formerly a small aside inside Overview (מצב התראות), then a combined
 * "התחברויות והתראות" category that also hosted notification-management UI
 * (composer/scheduled/history/fixed) -- that management surface now lives in
 * its own standalone product area, "מרכז התראות" (`/notifications`); this
 * category shows ONLY the login/readiness picture its narrower name
 * describes, so Overview can stay focused on operational issues.
 */
export type ManagerCategory = "overview" | "shifts" | "personnel" | "duties" | "logins";

/** Strict parse of `?category=` -- anything else (including missing) falls back to `"overview"`, never a guess or a crash. */
export function parseManagerCategoryParam(raw: string | null | undefined): ManagerCategory {
  if (raw === "shifts" || raw === "personnel" || raw === "duties" || raw === "logins") return raw;
  return "overview";
}

/**
 * `"logins"` ("התחברויות") is the ONLY category whose UI actually
 * renders `model.adoption` -- every other category (including the
 * selected-person drill-down, which never routes through a
 * `ManagerCategory` at all) has no use for the privileged Supabase Admin
 * API + bulk `push_subscriptions` readiness lookup that produces it. The
 * page threads this straight into `getRequestManagerOverview`'s
 * `needsAdoptionReadiness` argument so the read-model loader can skip that
 * lookup entirely for every other category -- see
 * `loadAdoptionReadiness` (`managerOverview.ts`) for the other, independent
 * skip condition (a person is selected).
 */
export function managerCategoryNeedsAdoptionReadiness(category: ManagerCategory): boolean {
  return category === "logins";
}

/**
 * Whether `ManagerCommandBar`'s person-scope + date-range controls make
 * sense for this category. `"logins"` ("התחברויות") is a current snapshot,
 * not scoped by either control (see
 * `managerCategoryNeedsAdoptionReadiness` above). `"personnel"` ("כוח אדם")
 * is the same kind of unscoped view -- a straightforward workforce/roster
 * page, not filtered by person or date range either -- so it hides the same
 * controls for the same reason, even though it has its own, unrelated
 * readiness gate (`managerCategoryNeedsRosterAvatars`). `DataFreshnessStatus`
 * is never gated by this -- see `ManagerCommandBar`'s own `showFilters` doc.
 */
export function managerCategoryNeedsFilters(category: ManagerCategory): boolean {
  return category !== "logins" && category !== "personnel";
}

/**
 * Whether the Personnel category ("כוח אדם") should decorate the roster
 * with real Google profile photos -- the ONLY category that renders
 * `ManagerRosterSection` with per-person avatars beyond the viewing
 * manager's own row. Deliberately independent of
 * `managerCategoryNeedsAdoptionReadiness`: Personnel needs presentation-only
 * account/avatar data (one bulk `fetchAllUserIdsByEmail()` lookup), never
 * the full `computeNotificationReadiness()` (which additionally queries
 * `push_subscriptions`) that `"logins"` needs -- see
 * `loadRosterAvatarLookup` (`managerOverview.ts`) for how this stays a
 * separate, narrower privileged lookup.
 */
export function managerCategoryNeedsRosterAvatars(category: ManagerCategory): boolean {
  return category === "personnel";
}

export interface ManagerHrefParams {
  personId: string | null;
  range: ManagerRangeKey;
  /** Raw "YYYY-MM"; only meaningful when `range === "month"`. */
  month: string | null;
  category: ManagerCategory;
}

/**
 * Builds a `/manager` URL for the given state, omitting every param that
 * already matches the route's own default (`person=all`, `range=7d`, no
 * `month`, `category=overview`) -- so the default scope is always the bare
 * `/manager`. Pure string building, no navigation/side effects -- safe to
 * call from a Server Component.
 */
export function buildManagerHref(params: ManagerHrefParams): string {
  const search = new URLSearchParams();

  if (params.personId) search.set("person", params.personId);
  if (params.range !== "7d") search.set("range", params.range);
  if (params.range === "month" && params.month) search.set("month", params.month);
  if (params.category !== "overview") search.set("category", params.category);

  const query = search.toString();
  return query ? `/manager?${query}` : "/manager";
}
