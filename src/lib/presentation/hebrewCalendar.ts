import { HDate, HebrewCalendar } from "@hebcal/core";
import { daysInCalendarMonth } from "@/lib/domain/calendarMonth";
import { parseCalendarDate, type CalendarDate } from "@/lib/domain/dutyBlocks";

const EREV_PREFIX = "Erev ";

/**
 * A local-component `Date` (never a parsed ISO string, never `new Date()`).
 * @hebcal/core's Gregorian<->Hebrew conversion reads back the same local
 * getters (`getFullYear`/`getMonth`/`getDate`) it was constructed from, so
 * this round-trips to the exact y/m/d we pass in regardless of the
 * runtime's own timezone -- no rollover risk.
 */
function toLocalJsDate({ year, month, day }: CalendarDate): Date {
  return new Date(year, month - 1, day);
}

/**
 * "כ״ט באב תשפ״ו" -- the Hebrew-calendar date matching `dateStr`, rendered
 * in Hebrew gematriya. `dateStr` must be the same Jerusalem-local civil
 * date already carried by `LocalNow.date` -- this never derives "today"
 * independently (no browser/server clock involved). Deterministic and
 * side-effect free. Returns null for an unparseable date, never throws.
 */
export function formatHebrewCalendarDate(dateStr: string): string | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return null;

  const hd = new HDate(toLocalJsDate(parsed));
  const [day, ...rest] = hd.renderGematriya(true).split(" ");
  if (rest.length < 2) return null;
  const year = rest[rest.length - 1];
  const month = rest.slice(0, -1).join(" ");
  return `${day} ב${month} ${year}`;
}

/** The Hebrew month word and Hebrew year (both non-numeric-day gematria tokens) for one Gregorian calendar day. */
function hebrewMonthAndYear(year: number, month: number, day: number): { month: string; year: string } | null {
  const hd = new HDate(new Date(year, month - 1, day));
  const [, ...rest] = hd.renderGematriya(true).split(" ");
  if (rest.length < 2) return null;
  return { year: rest[rest.length - 1], month: rest.slice(0, -1).join(" ") };
}

/**
 * "אב–אלול תשפ״ו" -- a restrained Hebrew-calendar month-range subtitle for
 * a Gregorian calendar page header, spanning the Hebrew month(s) the
 * Gregorian month `year`/`month` (1-12) touches. Collapses to a single
 * Hebrew month name when the whole Gregorian month falls inside one Hebrew
 * month. Returns null when the Gregorian month crosses a Hebrew *year*
 * boundary (e.g. September, which usually straddles Rosh Hashana) -- two
 * Hebrew years on one restrained line isn't cleanly derivable, so this is
 * omitted entirely rather than shown ambiguously.
 */
export function formatHebrewMonthRange(year: number, month: number): string | null {
  if (month < 1 || month > 12) return null;

  const daysInGregorianMonth = daysInCalendarMonth(year, month);
  const start = hebrewMonthAndYear(year, month, 1);
  const end = hebrewMonthAndYear(year, month, daysInGregorianMonth);
  if (!start || !end) return null;
  if (start.year !== end.year) return null;

  const months = start.month === end.month ? start.month : `${start.month}–${end.month}`;
  return `${months} ${start.year}`;
}

export interface HolidayContext {
  emoji: string;
  label: string;
}

interface HolidayInfo {
  emoji: string;
  label: string;
}

/**
 * Only holidays meaningful enough to surface in a daily glance. Deliberately
 * excludes Rosh Chodesh, minor fasts (Yom Kippur Katan, Ta'anit Esther/
 * Bechorot), special Shabbatot, and Omer-count noise -- those simply have
 * no entry here, so they never produce a chip. Keyed by @hebcal/core's
 * English `basename()`, which already strips "Erev "/day-number/year
 * qualifiers so both a holiday and its eve map to the same entry.
 * "Shmini Atzeret" is deliberately mapped to Simchat Torah's label/emoji --
 * in the Israel holiday schedule (`il: true`) the two are the same civil
 * day, unlike the two-day diaspora observance.
 */
const KNOWN_HOLIDAYS: Partial<Record<string, HolidayInfo>> = {
  "Rosh Hashana": { emoji: "🍎", label: "ראש השנה" },
  "Yom Kippur": { emoji: "🤍", label: "יום כיפור" },
  Sukkot: { emoji: "🌿", label: "סוכות" },
  "Shmini Atzeret": { emoji: "📜", label: "שמחת תורה" },
  Chanukah: { emoji: "🕎", label: "חנוכה" },
  Purim: { emoji: "🎭", label: "פורים" },
  Pesach: { emoji: "🍷", label: "פסח" },
  Shavuot: { emoji: "🌾", label: "שבועות" },
  "Yom HaAtzma'ut": { emoji: "🇮🇱", label: "יום העצמאות" },
};

/**
 * The single most meaningful holiday/Erev-holiday context for `dateStr`, or
 * null on an ordinary day. Driven entirely by @hebcal/core's deterministic
 * Israel holiday schedule (`il: true`) -- never fuzzy-matched against the
 * workbook's own "חגים" sheet, which describes holiday staffing/assignments,
 * not authoritative Gregorian holiday dates. "Erev" is read from the
 * library's own event description, never guessed from time of day.
 */
export function getHolidayContext(dateStr: string): HolidayContext | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return null;

  const events = HebrewCalendar.getHolidaysOnDate(toLocalJsDate(parsed), true) ?? [];
  for (const event of events) {
    const info = KNOWN_HOLIDAYS[event.basename()];
    if (!info) continue;
    const isErev = event.getDesc().startsWith(EREV_PREFIX);
    return { emoji: info.emoji, label: isErev ? `ערב ${info.label}` : info.label };
  }
  return null;
}
