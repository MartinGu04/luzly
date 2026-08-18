/**
 * Manager-facing links into the ALREADY-EXISTING manager-only `/schedule`
 * perspectives (PR #24) -- never a parallel calendar. `/schedule` itself
 * derives the displayed month from `?date=` when no explicit `?month=` is
 * given (see `app/(app)/schedule/page.tsx`'s `dateMonthOverride`), so
 * neither builder here needs to compute/pass a month separately.
 */

interface ScheduleEveryoneHrefParams {
  /** "YYYY-MM-DD" -- pre-selects that day in the team staffing calendar. Omitted entirely lands on today's month with nothing pre-selected. */
  date?: string | null;
}

/** Builds a `/schedule?person=all` URL -- the team-wide day/night coverage calendar. */
export function scheduleEveryoneHref(params: ScheduleEveryoneHrefParams = {}): string {
  const search = new URLSearchParams({ person: "all" });
  if (params.date) search.set("date", params.date);
  return `/schedule?${search.toString()}`;
}

interface SchedulePersonHrefParams {
  personId: string;
  /** "YYYY-MM-DD", same contract as `ScheduleEveryoneHrefParams.date`. */
  date?: string | null;
}

/** Builds a `/schedule?person=<id>` URL -- that team member's own real personal calendar. */
export function schedulePersonHref({ personId, date }: SchedulePersonHrefParams): string {
  const search = new URLSearchParams({ person: personId });
  if (date) search.set("date", date);
  return `/schedule?${search.toString()}`;
}
