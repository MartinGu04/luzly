import { getOperationalWeek } from "@/lib/domain/operationalWeek";
import type { LocalNow } from "@/lib/domain/localNow";
import type { AssignmentTiming } from "@/lib/domain/assignmentTiming";
import type { EventCategory } from "@/lib/domain/event";
import type { PersonalEventView } from "@/lib/readModels/types";
import { assignmentEmoji, personalActivityEmoji } from "./emoji";
import { absenceKindLabel, dutyFamilyLabel, periodLabel, roleLabel } from "./labels";

/**
 * One event on one day of "השבוע הקרוב" -- a display-ready projection of a
 * `PersonalEventView`, never the Event itself. `timing` is passed through
 * verbatim from the read model (server-resolved against `localNow`) so a
 * shift with `status !== "resolved"` never gets an invented time here.
 */
export interface PersonalWeekEventView {
  key: string;
  title: string;
  emoji: string | null;
  subtitle: string | null;
  category: EventCategory;
  timing: AssignmentTiming;
  tentative: boolean;
}

export interface PersonalWeekDayView {
  date: string;
  isToday: boolean;
  events: PersonalWeekEventView[];
}

/** Exactly seven days, Sunday -> Saturday, the operational week containing `localNow.date`. */
export interface PersonalWeekOverview {
  weekStart: string;
  weekEnd: string;
  days: PersonalWeekDayView[];
}

/**
 * The event's own emoji -- same routing `SelectedDayPanel`/the month-grid
 * indicator already use: a typed shift/duty/absence goes through
 * `assignmentEmoji`, while a display-only "status"/"other" personal
 * activity (e.g. סוגר/שלב 9) goes through `personalActivityEmoji`'s
 * title-keyed lookup. Never a third, newly-invented mapping.
 */
function weekEventEmoji(event: PersonalEventView): string | null {
  if (event.category === "status" || event.category === "other") {
    return personalActivityEmoji(event.title);
  }
  return assignmentEmoji(event);
}

/**
 * The structured subtitle line for one event -- a shift's role/period, a
 * duty's family+slot, an absence's kind. Same shape as `SelectedDayPanel`'s
 * own `eventSubtitle`: never re-derived from `event.title`'s free text.
 */
function weekEventSubtitle(event: PersonalEventView): string | null {
  if (event.category === "shift") {
    const parts = [roleLabel(event.role), periodLabel(event.period)].filter(
      (part): part is string => Boolean(part),
    );
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (event.category === "duty" && event.dutyFamily) {
    return event.slot !== null ? `${dutyFamilyLabel(event.dutyFamily)} ${event.slot}` : dutyFamilyLabel(event.dutyFamily);
  }
  if (event.category === "absence" && event.absenceKind) {
    return absenceKindLabel(event.absenceKind);
  }
  return null;
}

function toWeekEventView(event: PersonalEventView, index: number): PersonalWeekEventView {
  const rawSubtitle = weekEventSubtitle(event);
  return {
    key: `${event.date}-${index}`,
    title: event.title,
    emoji: weekEventEmoji(event),
    // A subtitle identical to the title (e.g. an "אפטר"/"חופש" absence)
    // says nothing the title above it doesn't already -- same elision
    // `SelectedDayPanel` already applies.
    subtitle: rawSubtitle && rawSubtitle !== event.title ? rawSubtitle : null,
    category: event.category,
    timing: event.timing,
    tentative: event.certainty === "tentative",
  };
}

/**
 * Builds "השבוע הקרוב": the fixed Sunday-Saturday operational week
 * containing `localNow.date`, every day represented explicitly (including
 * empty ones), from the authenticated person's own `calendarEvents` --
 * NEVER `upcomingEvents`, which deliberately excludes finished history and
 * would silently drop earlier-this-week days. Reuses `getOperationalWeek`
 * directly rather than deriving a second week definition. Within a day,
 * `calendarEvents` is already deterministically ordered (date -> effective
 * shift start -> category -> source tie-break, see
 * `buildPersonalScheduleReadModel.ts`'s `compareEventsForDisplay`) --
 * filtering by date preserves that order rather than re-sorting.
 */
export function buildPersonalWeekOverview(
  calendarEvents: readonly PersonalEventView[],
  localNow: LocalNow,
): PersonalWeekOverview {
  const week = getOperationalWeek(localNow);

  const days: PersonalWeekDayView[] = week.dates.map((date) => ({
    date,
    isToday: date === localNow.date,
    events: calendarEvents.filter((event) => event.date === date).map(toWeekEventView),
  }));

  return { weekStart: week.weekStart, weekEnd: week.weekEnd, days };
}
