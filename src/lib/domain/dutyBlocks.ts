import type { DutyFamily, Event } from "./event";

export type DutyBlockCertainty = "confirmed" | "tentative" | "mixed";

export type WeekendCompleteness = "complete" | "partial" | "not_applicable";

/**
 * A run of consecutive-calendar-day duty Events for one person, one duty
 * family, and (where applicable) one slot. Built purely from `Event`
 * metadata (`category`, `dutyFamily`, `slot`, `personId`, `date`,
 * `certainty`) -- never from Hebrew `rawValue`/`title`.
 */
export interface DutyBlock {
  personId: string;
  dutyFamily: DutyFamily;
  slot: number | null;
  startDate: string;
  endDate: string;
  /** Sorted, unique calendar dates actually present -- never fills holes. */
  dates: string[];
  /** Every contributing Event, chronologically ordered. Original references, never mutated. */
  events: Event[];
  certainty: DutyBlockCertainty;
  /** Unique calendar dates in the block -- NOT `events.length` (same-day duplicates never inflate this). */
  dayCount: number;
  weekendCompleteness: WeekendCompleteness;
}

/** A duty Event known (by construction) to have a non-null dutyFamily. */
type DutyEvent = Event & { dutyFamily: DutyFamily };

/**
 * Groups duty Events (`category === "duty" && dutyFamily !== null` -- every
 * other category never forms a block) into `DutyBlock`s: consecutive
 * calendar dates for the same person + duty family + slot. A missing date
 * breaks the run; a different person, family, or slot never merges.
 *
 * A literal duplicate Event reference is deduplicated up front so it can
 * never inflate `dayCount` or appear twice in a block; genuinely different
 * Events sharing a date are all preserved. An unparseable `Event.date`
 * never crashes grouping and never joins a valid consecutive run -- it
 * becomes its own standalone block.
 *
 * Output is sorted deterministically by startDate, then personId, then
 * dutyFamily, then slot -- never left to incidental Map/object order.
 */
export function buildDutyBlocks(events: readonly Event[]): DutyBlock[] {
  const dutyEvents = dedupeByReference(events).filter(isBlockableDutyEvent);

  const groups = new Map<string, DutyEvent[]>();
  for (const event of dutyEvents) {
    const key = groupKey(event.personId, event.dutyFamily, event.slot);
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }

  const blocks: DutyBlock[] = [];
  for (const groupEvents of groups.values()) {
    blocks.push(...splitIntoConsecutiveBlocks(groupEvents));
  }

  return blocks.sort(compareDutyBlocks);
}

function isBlockableDutyEvent(event: Event): event is DutyEvent {
  return event.category === "duty" && event.dutyFamily !== null;
}

function dedupeByReference<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function groupKey(personId: string, dutyFamily: DutyFamily, slot: number | null): string {
  return `${personId}${dutyFamily}${slot ?? ""}`;
}

function splitIntoConsecutiveBlocks(groupEvents: readonly DutyEvent[]): DutyBlock[] {
  const validEvents: DutyEvent[] = [];
  const invalidDateEvents: DutyEvent[] = [];

  for (const event of groupEvents) {
    if (parseCalendarDate(event.date)) validEvents.push(event);
    else invalidDateEvents.push(event);
  }

  const blocks: DutyBlock[] = [];

  // Never let an unparseable date silently join a valid consecutive run.
  for (const event of invalidDateEvents) {
    blocks.push(buildBlockFromEvents([event]));
  }

  if (validEvents.length > 0) {
    const eventsByDate = new Map<string, DutyEvent[]>();
    for (const event of validEvents) {
      const group = eventsByDate.get(event.date);
      if (group) group.push(event);
      else eventsByDate.set(event.date, [event]);
    }

    // Valid "YYYY-MM-DD" strings sort correctly as plain strings.
    const uniqueDates = [...eventsByDate.keys()].sort();

    let run: string[] = [uniqueDates[0]];
    for (let i = 1; i < uniqueDates.length; i++) {
      const current = uniqueDates[i];
      if (isNextCalendarDay(run[run.length - 1], current)) {
        run.push(current);
      } else {
        blocks.push(buildBlockFromEvents(flattenDates(run, eventsByDate)));
        run = [current];
      }
    }
    blocks.push(buildBlockFromEvents(flattenDates(run, eventsByDate)));
  }

  return blocks;
}

function flattenDates(dates: readonly string[], eventsByDate: Map<string, DutyEvent[]>): DutyEvent[] {
  return dates.flatMap((date) => eventsByDate.get(date) ?? []);
}

function buildBlockFromEvents(events: readonly DutyEvent[]): DutyBlock {
  const first = events[0];
  const orderedEvents = [...events].sort(compareEventsForBlockOrder);
  const dates = [...new Set(events.map((event) => event.date))].sort();

  const certaintySet = new Set(events.map((event) => event.certainty));
  const certainty: DutyBlockCertainty =
    certaintySet.size > 1 ? "mixed" : certaintySet.has("tentative") ? "tentative" : "confirmed";

  return {
    personId: first.personId,
    dutyFamily: first.dutyFamily,
    slot: first.slot,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dates,
    events: orderedEvents,
    certainty,
    dayCount: dates.length,
    weekendCompleteness: computeWeekendCompleteness(first.dutyFamily, dates),
  };
}

function compareEventsForBlockOrder(a: Event, b: Event): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.sourceCell !== b.sourceCell) return a.sourceCell < b.sourceCell ? -1 : 1;
  return 0;
}

function compareDutyBlocks(a: DutyBlock, b: DutyBlock): number {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  if (a.personId !== b.personId) return a.personId < b.personId ? -1 : 1;
  if (a.dutyFamily !== b.dutyFamily) return a.dutyFamily < b.dutyFamily ? -1 : 1;
  return (a.slot ?? -1) - (b.slot ?? -1);
}

// ---------------------------------------------------------------------------
// Weekend kitchen
// ---------------------------------------------------------------------------

/** 0=Sunday .. 6=Saturday. */
const THURSDAY = 4;

/**
 * The canonical weekend_kitchen span is Thursday-Friday-Saturday. Never
 * fabricates missing dates -- a 1- or 2-day (or misaligned 3-day) run is
 * "partial", not upgraded to "complete".
 */
function computeWeekendCompleteness(
  dutyFamily: DutyFamily,
  sortedDates: readonly string[],
): WeekendCompleteness {
  if (dutyFamily !== "weekend_kitchen") return "not_applicable";
  if (sortedDates.length !== 3) return "partial";

  const start = parseCalendarDate(sortedDates[0]);
  if (!start) return "partial";

  return dayOfWeek(start) === THURSDAY ? "complete" : "partial";
}

// ---------------------------------------------------------------------------
// Pure local calendar-date arithmetic -- deliberately no Date/UTC anywhere,
// so grouping can never be shifted by a runtime timezone.
// ---------------------------------------------------------------------------

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict "YYYY-MM-DD" -> a validated calendar date, or null (never throws). */
export function parseCalendarDate(dateStr: string): CalendarDate | null {
  const match = CALENDAR_DATE_RE.exec(dateStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return { year, month, day };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

function addOneDay(date: CalendarDate): CalendarDate {
  if (date.day < daysInMonth(date.year, date.month)) {
    return { year: date.year, month: date.month, day: date.day + 1 };
  }
  if (date.month < 12) {
    return { year: date.year, month: date.month + 1, day: 1 };
  }
  return { year: date.year + 1, month: 1, day: 1 };
}

/** True when `nextDateStr` is exactly the calendar day after `dateStr`. Invalid dates never count as consecutive. */
export function isNextCalendarDay(dateStr: string, nextDateStr: string): boolean {
  const date = parseCalendarDate(dateStr);
  const next = parseCalendarDate(nextDateStr);
  if (!date || !next) return false;

  const expected = addOneDay(date);
  return expected.year === next.year && expected.month === next.month && expected.day === next.day;
}

/**
 * Sakamoto's algorithm -- 0=Sunday .. 6=Saturday, pure integer arithmetic.
 * Exported for reuse by presentation-layer Hebrew weekday formatting, so a
 * calendar date's displayed weekday never has to be derived by constructing
 * a `Date` (and risking a runtime-timezone-dependent rollover).
 */
export function dayOfWeek({ year, month, day }: CalendarDate): number {
  const monthOffsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  return (
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + monthOffsets[month - 1] + day) % 7
  );
}
