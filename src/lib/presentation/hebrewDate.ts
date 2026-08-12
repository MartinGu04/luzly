import { dayOfWeek, isNextCalendarDay, parseCalendarDate } from "@/lib/domain/dutyBlocks";

const WEEKDAY_LABELS = [
  "יום ראשון",
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "יום שבת",
];

/**
 * Standard Hebrew single-letter weekday abbreviations, Sunday-first (index
 * 0 = Sunday, matching `dayOfWeek`/every Sunday-first calendar grid in this
 * codebase). Exported directly for a calendar grid's weekday header row.
 */
export const SHORT_WEEKDAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const MONTH_LABELS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

/**
 * "יום רביעי · 12 באוגוסט" from a plain "YYYY-MM-DD" -- deliberately no
 * `Date`/`Intl` construction. Weekday comes from the domain's pure
 * Sakamoto's-algorithm `dayOfWeek`, so this can never be off by a day due
 * to a runtime timezone. Returns null for an unparseable date (never
 * throws, never silently shows a wrong date).
 */
export function formatHebrewWeekdayAndDate(dateStr: string): string | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return null;

  const weekday = WEEKDAY_LABELS[dayOfWeek(parsed)];
  const month = MONTH_LABELS[parsed.month - 1];
  return `${weekday} · ${parsed.day} ב${month}`;
}

/** Just the weekday label, e.g. "יום חמישי". */
export function formatHebrewWeekday(dateStr: string): string | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return null;
  return WEEKDAY_LABELS[dayOfWeek(parsed)];
}

/** "ה׳" -- the standard single-letter Hebrew weekday abbreviation. */
export function formatShortWeekday(dateStr: string): string | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return null;
  return SHORT_WEEKDAY_LABELS[dayOfWeek(parsed)];
}

/** Compact "12.8" day.month form, for dense upcoming-list rows. */
export function formatCompactDate(dateStr: string): string | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return null;
  return `${parsed.day}.${parsed.month}`;
}

/** "אוגוסט 2026" -- the Hebrew-language Gregorian month/year label for a calendar page header. `month` is 1-12. Returns null for an out-of-range month. */
export function formatHebrewMonthYear(year: number, month: number): string | null {
  if (month < 1 || month > 12) return null;
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

export type RelativeDayLabel = "today" | "tomorrow" | "other";

/** Whether `dateStr` is `todayStr`, the calendar day right after it, or neither -- pure string/date-table comparison, no Date/UTC. */
export function relativeDayLabel(dateStr: string, todayStr: string): RelativeDayLabel {
  if (dateStr === todayStr) return "today";
  if (isNextCalendarDay(todayStr, dateStr)) return "tomorrow";
  return "other";
}
