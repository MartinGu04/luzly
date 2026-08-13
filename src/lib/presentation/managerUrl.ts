import type { ManagerRangeKey } from "@/lib/domain/dateRange";

export interface ManagerHrefParams {
  personId: string | null;
  range: ManagerRangeKey;
  /** Raw "YYYY-MM"; only meaningful when `range === "month"`. */
  month: string | null;
  problemsOnly: boolean;
}

/**
 * Builds a `/manager` URL for the given state, omitting every param that
 * already matches the route's own default (`person=all`, `range=7d`, no
 * `month`, `problems` off) -- so the default scope is always the bare
 * `/manager`, exactly as PR #14 specifies. Pure string building, no
 * navigation/side effects -- safe to call from a Server Component.
 */
export function buildManagerHref(params: ManagerHrefParams): string {
  const search = new URLSearchParams();

  if (params.personId) search.set("person", params.personId);
  if (params.range !== "7d") search.set("range", params.range);
  if (params.range === "month" && params.month) search.set("month", params.month);
  if (params.problemsOnly) search.set("problems", "1");

  const query = search.toString();
  return query ? `/manager?${query}` : "/manager";
}
