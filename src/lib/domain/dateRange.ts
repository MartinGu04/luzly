import type { CalendarMonthKey } from "./calendarMonth";
import { daysInCalendarMonth, parseMonthParam } from "./calendarMonth";
import type { CalendarDate } from "./dutyBlocks";
import { parseCalendarDate } from "./dutyBlocks";
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
