import type { PersonalEventView } from "@/lib/readModels/types";
import { assignmentEmoji } from "./emoji";
import { eventColorBgClassName } from "./eventColor";
import { absenceKindLabel, dutyFamilyLabel, periodLabel } from "./labels";

/**
 * One compact, scannable indicator for a "הלוח שלי" month-grid day cell --
 * never the full event title (that belongs only in the selected-day
 * detail). A short word per category: the shift's period ("יום"/"לילה"/
 * "בוקר"), the duty's own family label ("שמירה"/"מטבח מלא"/... -- the same
 * `dutyFamilyLabel` the selected-day detail already uses, never a second
 * Hebrew mapping invented here), or the absence's own kind label ("חופש"/
 * "אפטר"/...).
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
  /**
   * The semantic per-event-type soft-background class (`eventColorBgClassName`,
   * `lib/presentation/eventColor.ts`), or `null` when the event's category/
   * dutyFamily/absenceKind isn't one of the 8 mapped slots. This is a
   * PERSONAL-calendar-only concept -- `EveryoneMonthGrid` never builds a
   * `CalendarDayIndicator` at all (it computes its own coverage-status
   * indicators), so the shared "כולם" calendar is structurally unaffected
   * by this field's existence.
   */
  colorClassName: string | null;
}

const GENERIC_SHIFT_LABEL = "משמרת";
const GENERIC_DUTY_LABEL = "תורנות";

/** The compact label for one calendar event -- purely a lookup through the app's own existing label maps, never a new one-off classification. */
function eventIndicatorLabel(event: PersonalEventView): string {
  if (event.category === "shift") return periodLabel(event.period) ?? GENERIC_SHIFT_LABEL;
  if (event.category === "duty") return event.dutyFamily ? dutyFamilyLabel(event.dutyFamily) : GENERIC_DUTY_LABEL;
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
    colorClassName: eventColorBgClassName(event),
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
