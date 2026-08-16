import { dayOfWeek } from "./dutyBlocks";
import type { LocalNow } from "./localNow";

/**
 * A Gregorian calendar month, independent of any specific day within it.
 * `month` is 1-12 (never 0-based) to match every other calendar-date shape
 * in this codebase (see `CalendarDate` in `dutyBlocks.ts`).
 */
export interface CalendarMonthKey {
  year: number;
  month: number;
}

const MONTH_PARAM_RE = /^(\d{4})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

/** Number of days in `month` (1-12) of `year`, leap years included. */
export function daysInCalendarMonth(year: number, month: number): number {
  return daysInMonth(year, month);
}

/**
 * Strict "YYYY-MM" -> a validated `CalendarMonthKey`, or null for anything
 * else (wrong shape, out-of-range month, non-numeric). Never throws --
 * callers fall back to a known-safe month (the Jerusalem-local current
 * month) rather than propagate a bad query param.
 */
export function parseMonthParam(raw: string | null | undefined): CalendarMonthKey | null {
  if (!raw) return null;
  const match = MONTH_PARAM_RE.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  return { year, month };
}

/** "YYYY-MM", the inverse of `parseMonthParam`. */
export function formatMonthParam({ year, month }: CalendarMonthKey): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** The Gregorian month a `LocalNow.date` ("YYYY-MM-DD") falls in -- the shared "default display month" / "today" navigation target every month-scoped screen (Schedule, Manager Overview's month range) derives the same way. */
export function calendarMonthOfLocalNow(localNow: LocalNow): CalendarMonthKey {
  const [year, month] = localNow.date.split("-").map(Number);
  return { year, month };
}

/** `delta` months from `key`, correctly rolling the year over in either direction (Dec -> Jan, Jan -> Dec). */
export function shiftCalendarMonth({ year, month }: CalendarMonthKey, delta: number): CalendarMonthKey {
  const zeroBasedTotal = (month - 1) + delta;
  const yearOffset = Math.floor(zeroBasedTotal / 12);
  const newZeroBasedMonth = ((zeroBasedTotal % 12) + 12) % 12;
  return { year: year + yearOffset, month: newZeroBasedMonth + 1 };
}

/** 0 (Sunday) .. 6 (Saturday) -- the weekday of the 1st of `month`/`year`, via the same Sakamoto's-algorithm `dayOfWeek` the rest of the domain uses. */
export function firstWeekdayOfCalendarMonth(year: number, month: number): number {
  return dayOfWeek({ year, month, day: 1 });
}

/**
 * Whether a Sunday-first grid column (0=Sunday .. 6=Saturday -- the same
 * index `buildMonthGrid`'s Sunday-first weeks use) falls on the Israeli
 * weekend, Thursday through Saturday. The one place this convention is
 * defined -- matches the Thu-Fri-Sat span `weekend_kitchen` duty
 * completeness already assumes (`dutyBlocks.ts`) -- so calendar UI never
 * hardcodes its own weekend rule.
 */
export function isWeekendColumn(columnIndex: number): boolean {
  return columnIndex >= 4;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** One calendar-grid cell: a real date, always -- `inMonth` distinguishes `month`/`year`'s own days from the leading/trailing adjacent-month days used to pad the grid to a stable shape. */
export interface CalendarGridCell {
  date: string;
  inMonth: boolean;
}

/** Every month grid is exactly 6 Sunday-Saturday weeks -- see `buildMonthGrid`. */
export const CALENDAR_GRID_WEEKS = 6;
const CALENDAR_GRID_CELLS = CALENDAR_GRID_WEEKS * 7;

/**
 * A Sunday-first month grid for `month`/`year`: always exactly 42 cells (6
 * complete weeks), REGARDLESS of how many days `month` has or which weekday
 * it starts on. Leading/trailing padding is filled with the real adjacent
 * month's own dates (`inMonth: false`), never `null` -- so a calendar UI can
 * show a genuine (dimmed) date in every cell instead of an empty "ghost"
 * one, and the grid's rendered geometry (row/cell count) never changes
 * between one month and the next. This fixed shape is a deliberate product
 * requirement (PR #38): switching months must never change the calendar's
 * physical height.
 */
export function buildMonthGrid(year: number, month: number): CalendarGridCell[] {
  const leadingBlanks = firstWeekdayOfCalendarMonth(year, month);
  const totalDays = daysInMonth(year, month);

  const cells: CalendarGridCell[] = [];

  if (leadingBlanks > 0) {
    const prev = shiftCalendarMonth({ year, month }, -1);
    const prevMonthDays = daysInMonth(prev.year, prev.month);
    for (let i = leadingBlanks; i > 0; i--) {
      cells.push({ date: formatDate(prev.year, prev.month, prevMonthDays - i + 1), inMonth: false });
    }
  }

  for (let day = 1; day <= totalDays; day++) {
    cells.push({ date: formatDate(year, month, day), inMonth: true });
  }

  const next = shiftCalendarMonth({ year, month }, 1);
  let nextDay = 1;
  while (cells.length < CALENDAR_GRID_CELLS) {
    cells.push({ date: formatDate(next.year, next.month, nextDay), inMonth: false });
    nextDay++;
  }

  return cells;
}
