import type { CalendarMonthKey } from "./calendarMonth";
import { daysInCalendarMonth, parseMonthParam } from "./calendarMonth";
import type { CalendarDate } from "./dutyBlocks";
import { dayOfWeek, parseCalendarDate } from "./dutyBlocks";
import type { LocalNow } from "./localNow";

/**
 * The manager overview's date-range selection. Strict allowlist of four
 * values -- anything else is an invalid `?range=` query param and falls
 * back to "7d" (see `parseManagerRangeParam`). No Date/UTC anywhere in this
 * file; every calendar computation is plain string/number arithmetic
 * against `LocalNow.date`, the same convention as the rest of `domain`.
 */
export type ManagerRangeKey = "today" | "7d" | "30d" | "month";

const VALID_RANGE_KEYS: ReadonlySet<string> = new Set(["today", "7d", "30d", "month"]);

/** Strict allowlist parse of the `?range=` query param -- anything else (including missing) falls back to "7d". */
export function parseManagerRangeParam(raw: string | null | undefined): ManagerRangeKey {
  if (raw !== null && raw !== undefined && VALID_RANGE_KEYS.has(raw)) {
    return raw as ManagerRangeKey;
  }
  return "7d";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" from a validated `CalendarDate` -- the inverse of `parseCalendarDate`. */
export function formatCalendarDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${pad2(date.month)}-${pad2(date.day)}`;
}

/**
 * `date` plus `n` civil days (n >= 0), correctly rolling month/year
 * boundaries (including leap-year February) -- pure integer arithmetic,
 * no Date/UTC.
 */
export function addCalendarDays(date: CalendarDate, n: number): CalendarDate {
  let { year, month, day } = date;
  let remaining = n;

  while (remaining > 0) {
    const daysLeftInMonth = daysInCalendarMonth(year, month) - day;
    if (remaining <= daysLeftInMonth) {
      day += remaining;
      remaining = 0;
    } else {
      remaining -= daysLeftInMonth + 1;
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  return { year, month, day };
}

/**
 * `date` minus `n` civil days (n >= 0), correctly rolling month/year
 * boundaries backward -- the missing counterpart to `addCalendarDays`
 * above, which only ever supports n >= 0 forward (see its own docstring).
 */
export function subtractCalendarDays(date: CalendarDate, n: number): CalendarDate {
  let { year, month, day } = date;
  let remaining = n;

  while (remaining > 0) {
    if (remaining < day) {
      day -= remaining;
      remaining = 0;
    } else {
      remaining -= day;
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      day = daysInCalendarMonth(year, month);
    }
  }

  return { year, month, day };
}

/**
 * Resolves a bare "day.month" (no year) to the nearest calendar date that
 * is today or later -- this year's occurrence if it hasn't passed yet,
 * otherwise next year's. Used by search's date-query parsing ("19.8"),
 * never by anything that already has an explicit year. Returns null for a
 * structurally invalid day/month (day/month out of range, or a day that
 * doesn't exist in that month even the following year -- e.g. day=31,
 * month=2) or an unparseable `localNow.date`, never a guessed date.
 */
export function resolveNearestCalendarDate(day: number, month: number, localNow: LocalNow): string | null {
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1) return null;

  const today = parseCalendarDate(localNow.date);
  if (!today) return null;

  if (day <= daysInCalendarMonth(today.year, month)) {
    const thisYear = formatCalendarDate({ year: today.year, month, day });
    if (thisYear >= localNow.date) return thisYear;
  }

  if (day > daysInCalendarMonth(today.year + 1, month)) return null;
  return formatCalendarDate({ year: today.year + 1, month, day });
}

/**
 * Resolves a weekday index (0=Sunday..6=Saturday, matching `dayOfWeek`) to
 * the nearest date that is today or later -- prefers TODAY when it already
 * falls on the requested weekday, rather than skipping ahead a full week.
 * Returns null only when `localNow.date` itself is unparseable.
 */
export function resolveNextWeekdayDate(weekdayIndex: number, localNow: LocalNow): string | null {
  const today = parseCalendarDate(localNow.date);
  if (!today) return null;

  const offset = (weekdayIndex - dayOfWeek(today) + 7) % 7;
  return formatCalendarDate(addCalendarDays(today, offset));
}

export interface ManagerDateRange {
  key: ManagerRangeKey;
  startDate: string;
  endDate: string;
  /** Every calendar date in the range, ascending, inclusive. Never empty. */
  dates: string[];
  /** Set only when `key === "month"` -- the resolved (validated or defaulted) month. */
  month: CalendarMonthKey | null;
}

const FIXED_RANGE_DAY_COUNTS: Record<"today" | "7d" | "30d", number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
};

/**
 * Resolves a `ManagerRangeKey` (+ raw `?month=` param for "month") against
 * `localNow` into the concrete list of civil dates it covers.
 *
 * - "today": `[localNow.date]` only.
 * - "7d"/"30d": `localNow.date` plus the next 6/29 civil dates.
 * - "month": every day of the selected Gregorian month. A missing/invalid
 *   `monthParam` (fails `parseMonthParam`'s strict "YYYY-MM" check) falls
 *   back to the month containing `localNow.date` -- never a crash, never a
 *   silently-wrong month.
 *
 * `localNow.date` is trusted to already be a valid "YYYY-MM-DD" (it comes
 * from `getJerusalemLocalNow()`), but the fallback path below stays honest
 * even if that ever weren't true, rather than throwing.
 */
export function resolveManagerDateRange(
  key: ManagerRangeKey,
  monthParam: string | null | undefined,
  localNow: LocalNow,
): ManagerDateRange {
  const today = parseCalendarDate(localNow.date);

  if (key === "month") {
    const fallbackMonth: CalendarMonthKey = today
      ? { year: today.year, month: today.month }
      : { year: 1970, month: 1 };
    const month = parseMonthParam(monthParam ?? undefined) ?? fallbackMonth;

    const totalDays = daysInCalendarMonth(month.year, month.month);
    const dates: string[] = [];
    for (let day = 1; day <= totalDays; day++) {
      dates.push(formatCalendarDate({ year: month.year, month: month.month, day }));
    }

    return { key: "month", startDate: dates[0], endDate: dates[dates.length - 1], dates, month };
  }

  if (!today) {
    return { key, startDate: localNow.date, endDate: localNow.date, dates: [localNow.date], month: null };
  }

  const count = FIXED_RANGE_DAY_COUNTS[key];
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(formatCalendarDate(addCalendarDays(today, i)));
  }

  return { key, startDate: dates[0], endDate: dates[dates.length - 1], dates, month: null };
}
