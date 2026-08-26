import "server-only";
import { cache } from "react";
import { addCalendarDays, formatCalendarDate } from "@/lib/domain/dateRange";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { getActiveEmergencyModePeriod, getAllEmergencyModePeriods } from "./store";
import type { EmergencyModePeriod, OperationalMode } from "./types";

/**
 * The ONE resolver of "which operational world is live right now" --
 * every read model/Server Action that needs to branch on Emergency Mode
 * calls this instead of querying `emergency_mode_periods` itself.
 *
 * Deliberately `cache()`-wrapped (React's per-request memoization, the
 * SAME kind `getRequestAuthenticatedIdentity` uses -- see that file's
 * own docs for why this is safe) rather than the 30-second cross-request
 * `unstable_cache` the Google workbook snapshot uses: Emergency Mode
 * activation must be effectively immediate for the acting manager and
 * for every other authenticated user on their next request, never
 * delayed by a shared short-TTL cache. A brand new request always
 * re-reads the database; this wrapper only stops the SAME request from
 * asking twice.
 */
export const resolveOperationalMode = cache(async (): Promise<OperationalMode> => {
  const activePeriod = await getActiveEmergencyModePeriod();
  if (!activePeriod) return { kind: "regular" };
  return { kind: "emergency", period: activePeriod };
});

/** Request-scoped read of the full activation history -- used to build the emergency-dates exclusion set for fairness (never just the currently active period, since a PAST period's dates must also stay excluded). */
export const getEmergencyModeHistory = cache(async (): Promise<EmergencyModePeriod[]> => {
  return getAllEmergencyModePeriods();
});

/**
 * Expands one period's `[startDate, endDate]` (inclusive) into every
 * "YYYY-MM-DD" it covers. A still-active period (`endDate === null`) is
 * expanded through `todayDate` instead -- callers pass the caller's own
 * `LocalNow.date` so this stays pure/testable rather than reading the
 * clock itself.
 */
function expandPeriodDates(period: EmergencyModePeriod, todayDate: string): string[] {
  const start = parseCalendarDate(period.startDate);
  if (!start) return [];

  const endDateStr = period.endDate ?? todayDate;
  const end = parseCalendarDate(endDateStr);
  if (!end) return [period.startDate];

  const dates: string[] = [];
  let cursor = start;
  let cursorStr = formatCalendarDate(cursor);
  // A malformed/future-inverted range (end before start) safely yields
  // just the start date rather than looping forever or backward.
  for (let i = 0; cursorStr <= endDateStr && i < 3660; i++) {
    dates.push(cursorStr);
    cursor = addCalendarDays(cursor, 1);
    cursorStr = formatCalendarDate(cursor);
  }
  return dates;
}

/**
 * The full set of calendar dates touched by ANY recorded Emergency Mode
 * period (past or currently active) -- "dates are atomic" (spec section
 * 1/18): a period activated at 14:00 on a date excludes that ENTIRE
 * date. Regular shift/duty fairness engines filter their own
 * `periodDates`/date-range inputs against this set so emergency dates
 * never contribute to regular fairness, consistently across headline
 * numbers AND tooltip explanations (both must use the SAME set).
 */
export function buildEmergencyDateSet(periods: readonly EmergencyModePeriod[], todayDate: string): Set<string> {
  const dates = new Set<string>();
  for (const period of periods) {
    for (const date of expandPeriodDates(period, todayDate)) {
      dates.add(date);
    }
  }
  return dates;
}

/** Request-scoped convenience: the full emergency-dates exclusion set, ready to hand to fairness engines. */
export const getEmergencyDateSet = cache(async (todayDate: string): Promise<Set<string>> => {
  const periods = await getEmergencyModeHistory();
  return buildEmergencyDateSet(periods, todayDate);
});
