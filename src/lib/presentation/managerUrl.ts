import type { ManagerRangeKey } from "@/lib/domain/dateRange";

/**
 * The Manager Area's top-level categories (redesign, PR follow-up to #14/
 * #21/#37/#40) -- "סקירה" (Overview) is the default command-center view,
 * omitted from the URL like every other "default" param this app already
 * omits (`FairnessMode`'s `shifts`, `DutyView`'s `upcoming`). The next
 * three each own one previously-scattered slice of the old single long
 * page: "משמרות" (coverage + Potential reconciliation), "כוח אדם" (roster
 * + person drill-down), "תורנויות והיעדרויות" (cross-team duties/absences).
 * "התחברויות והתראות" is a management-visibility category, not operational
 * data: it reconciles the same roster against Supabase auth/push-
 * subscription state to show login/notification adoption -- see
 * `ManagerAdoptionView`. Formerly a small aside inside Overview (מצב
 * התראות); now its own full category so Overview can stay focused on
 * operational issues.
 */
export type ManagerCategory = "overview" | "shifts" | "personnel" | "duties" | "logins";

/** Strict parse of `?category=` -- anything else (including missing) falls back to `"overview"`, never a guess or a crash. */
export function parseManagerCategoryParam(raw: string | null | undefined): ManagerCategory {
  if (raw === "shifts" || raw === "personnel" || raw === "duties" || raw === "logins") return raw;
  return "overview";
}

/**
 * `"logins"` ("התחברויות והתראות") is the ONLY category whose UI actually
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
