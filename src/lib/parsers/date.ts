/**
 * Parses a spreadsheet date cell into a stable "YYYY-MM-DD" calendar date.
 *
 * Deliberately does NOT construct a `Date` object anywhere — the workbook's
 * timezone is Asia/Jerusalem, and routing through `Date`/UTC would risk
 * shifting the calendar day depending on the runtime's local timezone. This
 * is pure string parsing, so the result is identical regardless of TZ.
 *
 * Tolerates (and discards) a trailing time-of-day component
 * ("29/06/2026 0:00:00", "2026-06-29T00:00:00", "29/06/2026 00:00") --
 * Google Sheets' `FORMATTED_STRING` date-time rendering includes one
 * whenever a column's cell format is "Date time" rather than plain "Date"
 * (a real, common real-world workbook-authoring inconsistency: a column
 * typed as dates can still end up formatted as datetime, especially if a
 * single cell in it ever had a time entered). Only the calendar date part
 * is ever used -- the time is never interpreted as anything meaningful.
 *
 * Returns null (never throws) for text it doesn't recognize.
 */
export function parseLocalDate(raw: string): string | null {
  const text = raw.trim();

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (iso) {
    const [, year, month, day] = iso;
    return toIsoDate(year, month, day);
  }

  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return toIsoDate(year, month, day);
  }

  return null;
}

function toIsoDate(year: string, month: string, day: string): string {
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
