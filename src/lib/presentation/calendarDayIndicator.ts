import type { PersonalEventView } from "@/lib/readModels/types";
import type { HolidayContext } from "./hebrewCalendar";
import { assignmentEmoji } from "./emoji";
import { absenceKindLabel, periodLabel } from "./labels";

/**
 * One compact, scannable indicator for a "הלוח שלי" month-grid day cell --
 * never the full event title (that belongs only in the selected-day
 * detail). A short, generic word per category: the shift's period ("יום"/
 * "לילה"/"בוקר"), the generic "תורנות" for any duty (never the specific
 * family -- that level of detail belongs in the day panel), the absence's
 * own kind label ("חופש"/"אפטר"/...), or the holiday's already-short
 * `shortLabel` ("חג"/"ערב חג"/"חוה״מ").
 */
export interface CalendarDayIndicator {
  key: string;
  emoji: string | null;
  label: string;
  tentative: boolean;
}

const GENERIC_SHIFT_LABEL = "משמרת";
const GENERIC_DUTY_LABEL = "תורנות";

/** The compact label for one calendar event -- purely a lookup through the app's own existing label maps, never a new one-off classification. */
function eventIndicatorLabel(event: PersonalEventView): string {
  if (event.category === "shift") return periodLabel(event.period) ?? GENERIC_SHIFT_LABEL;
  if (event.category === "duty") return GENERIC_DUTY_LABEL;
  if (event.category === "absence" && event.absenceKind) return absenceKindLabel(event.absenceKind);
  return event.title;
}

/** One personal calendar event (shift/duty/absence) as a compact grid indicator. */
export function eventIndicator(event: PersonalEventView, key: string): CalendarDayIndicator {
  return {
    key,
    emoji: assignmentEmoji(event),
    label: eventIndicatorLabel(event),
    tentative: event.certainty === "tentative",
  };
}

/** A day's holiday context as a compact grid indicator -- always the generic `shortLabel`, never the specific holiday name (that belongs in the selected-day detail). */
export function holidayIndicator(holiday: HolidayContext): CalendarDayIndicator {
  return { key: "holiday", emoji: holiday.emoji, label: holiday.shortLabel, tentative: false };
}

/**
 * Every indicator for one day, holiday first (calendar context) then the
 * day's own events in their existing deterministic order -- callers slice
 * this down to however many indicators actually fit (see `CalendarGrid`'s
 * responsive 1-2-visible-plus-overflow rule); this function itself never
 * truncates, so the true total count stays available for an accurate "+N".
 */
export function buildDayIndicators(
  events: readonly PersonalEventView[],
  holiday: HolidayContext | null,
): CalendarDayIndicator[] {
  const indicators: CalendarDayIndicator[] = [];
  if (holiday) indicators.push(holidayIndicator(holiday));
  events.forEach((event, index) => indicators.push(eventIndicator(event, `event-${index}`)));
  return indicators;
}
