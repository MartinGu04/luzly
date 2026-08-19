import { formatCalendarDate, subtractCalendarDays } from "@/lib/domain/dateRange";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import type { LocalNow } from "@/lib/domain/localNow";

/**
 * How many days of PAST history the external ICS feed includes, counted
 * back from `now.date`. Deliberately asymmetric: future events are never
 * bounded (a person's whole known future schedule always appears,
 * however far out it's already entered), only this lower edge exists --
 * see `icsFeedCutoffDate`.
 *
 * This window applies ONLY to the external calendar feed
 * (`loadCalendarFeedForToken.ts`). `lib/readModels/buildPersonalScheduleReadModel.ts`'s
 * own `calendarEvents` field (the in-app "הלוח שלי" personal calendar)
 * stays exactly as unbounded as it always was -- this file is never
 * imported from there, and never changes what that read model returns.
 */
export const ICS_FEED_PAST_WINDOW_DAYS = 30;

/**
 * The earliest calendar date (inclusive) the ICS feed includes -- pure
 * calendar-date arithmetic (`subtractCalendarDays`), no Date/UTC, same
 * convention as the rest of `domain`. An unparseable `now.date` (should
 * never happen -- it comes from `getJerusalemLocalNow()`) degrades to
 * `now.date` itself (today-only) rather than throwing and failing the
 * whole feed.
 */
export function icsFeedCutoffDate(now: LocalNow): string {
  const today = parseCalendarDate(now.date);
  if (!today) return now.date;
  return formatCalendarDate(subtractCalendarDays(today, ICS_FEED_PAST_WINDOW_DAYS));
}

/**
 * Whether `eventDate` falls inside the ICS feed's window: `now.date`
 * minus `ICS_FEED_PAST_WINDOW_DAYS`, inclusive, through unbounded future.
 * Compares "YYYY-MM-DD" strings directly (valid dates in that form sort
 * correctly as plain strings, same trick used throughout `domain`) --
 * never a `Date`/UTC comparison.
 *
 * Keyed on the Event's own anchor date (`event.date`) -- the same date
 * field every other date-keyed decision in this codebase treats as an
 * Event's identity (`compareEventsForDisplay`, `DutyBlock` grouping,
 * `isCalendarDisplayEvent`), never the shift's resolved start/end instant
 * (which would require a resolvable shift schedule, and duty/absence
 * Events have no such instant to begin with).
 */
export function isWithinIcsFeedWindow(eventDate: string, now: LocalNow): boolean {
  return eventDate >= icsFeedCutoffDate(now);
}
