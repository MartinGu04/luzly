import type { PersonalEventView } from "@/lib/readModels/types";
import { assignmentEmoji } from "./emoji";
import { absenceKindLabel, periodLabel } from "./labels";

/**
 * One compact, scannable indicator for a "הלוח שלי" month-grid day cell --
 * never the full event title (that belongs only in the selected-day
 * detail). A short, generic word per category: the shift's period ("יום"/
 * "לילה"/"בוקר"), the generic "תורנות" for any duty (never the specific
 * family -- that level of detail belongs in the day panel), or the
 * absence's own kind label ("חופש"/"אפטר"/...).
 *
 * A day's holiday is deliberately NOT one of these -- it's calendar
 * context about the date itself, not something the person is doing, so it
 * never competes with these for the limited indicator slots or the "+N"
 * overflow count. `CalendarGrid` renders it separately, next to the day
 * number (see `EveryoneMonthGrid`'s own holiday-emoji placement, which
 * this mirrors).
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

/**
 * Every personal-event indicator for one day, in the events' own existing
 * deterministic order -- callers slice this down to however many
 * indicators actually fit (see `CalendarGrid`'s responsive visible-plus-
 * overflow rule); this function itself never truncates, so the true total
 * count stays available for an accurate "+N". Holiday context is
 * deliberately NOT included here -- see the module doc comment.
 */
export function buildDayIndicators(events: readonly PersonalEventView[]): CalendarDayIndicator[] {
  return events.map((event, index) => eventIndicator(event, `event-${index}`));
}
