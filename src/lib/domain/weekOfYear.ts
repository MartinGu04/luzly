import type { CalendarDate } from "./dutyBlocks";
import { dayOfWeek } from "./dutyBlocks";

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

/** 0-indexed day-of-year: January 1st -> 0. */
function zeroIndexedDayOfYear({ year, month, day }: CalendarDate): number {
  let total = day - 1;
  for (let m = 1; m < month; m++) total += daysInMonth(year, m);
  return total;
}

/**
 * Sunday-first week-of-year number, the SAME convention `buildMonthGrid`
 * already uses for its rows (`calendarMonth.ts`) -- this is the ONLY week-
 * numbering convention used anywhere in Luzly. Matches the classic
 * strftime `%U` specifier: week 1 begins on the year's first Sunday, and
 * any days before that (only possible when January 1st itself isn't a
 * Sunday) fall in "week 0".
 *
 * Deliberately NOT the Monday-first ISO-8601 week number: an ISO week
 * starts mid-row relative to a Sunday-first grid and ends mid-row the
 * following week, so a single Sunday-Saturday calendar row could
 * straddle two different ISO week numbers. This formula never can --
 * every date within the same Sunday-Saturday span produces the identical
 * result, because `dayOfYear - weekday` is invariant across any 7-day
 * Sunday-Saturday span (see `weekOfYear.test.ts` for the proof/coverage).
 */
export function weekOfYear(date: CalendarDate): number {
  const yday = zeroIndexedDayOfYear(date);
  const wday = dayOfWeek(date);
  return Math.floor((yday - wday + 7) / 7);
}
