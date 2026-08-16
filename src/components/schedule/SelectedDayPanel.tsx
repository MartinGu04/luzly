import { assignmentEmoji } from "@/lib/presentation/emoji";
import { absenceKindLabel, dutyFamilyLabel, periodLabel, roleLabel } from "@/lib/presentation/labels";
import type { PersonalEventView } from "@/lib/readModels/types";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { TimeRange } from "@/components/dashboard/TimeRange";
import { SELECTED_DAY_PANEL_MIN_HEIGHT_CLASS } from "./CalendarSurface";
import type { DayMeta } from "./types";

interface SelectedDayPanelProps {
  dayMeta: DayMeta | null;
  events: PersonalEventView[];
}

/**
 * The structured subtitle line for one event, distinct per category -- a
 * shift's own role/period, a duty's family+slot, an absence's kind. Never
 * re-derives these from `event.title`'s free text; every value here is a
 * typed field run through the app's existing label maps.
 */
function eventSubtitle(event: PersonalEventView): string | null {
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

/**
 * The selected calendar day's full detail -- every shift/duty/absence on
 * that date, never collapsed to one even when there are several, plus the
 * day's full holiday context. This is deliberately where all the detail
 * lives (the month grid cell next to it stays compact, only a couple of
 * short indicators -- see `CalendarGrid`). Shows only what the server
 * already resolved (`timing`) -- never invents a time for something whose
 * hour can't be evaluated, and never shows a time row at all for a duty or
 * absence (neither is a timed shift). Lives in the desktop side column
 * next to the calendar (see `ScheduleCalendar`), stacking below it on
 * mobile. Wrapped in an accessible, addressable `region` -- both a real
 * a11y landmark and how tests scope queries here vs. the calendar grid's
 * own in-cell indicators (the same event can now legitimately appear in
 * both places at once, in different wording).
 */
export function SelectedDayPanel({ dayMeta, events }: SelectedDayPanelProps) {
  if (!dayMeta) return null;

  return (
    <section aria-label="פרטי היום הנבחר">
      <Panel variant="panel" className={SELECTED_DAY_PANEL_MIN_HEIGHT_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-base font-bold text-foreground sm:text-lg">{dayMeta.dateLabel}</p>
          {dayMeta.holiday ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-overlay-soft px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-border">
              <span aria-hidden="true">{dayMeta.holiday.emoji}</span>
              {dayMeta.holiday.label}
            </span>
          ) : null}
        </div>

        {events.length === 0 ? (
          <p className="mt-3 text-sm text-muted">היום פנוי אצלך 😌</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {events.map((event, index) => {
              const emoji = assignmentEmoji(event);
              // A subtitle identical to the title (e.g. an "אפטר"/"חופש"
              // absence, where both the title and the kind label read the
              // same) says nothing the title above it doesn't already --
              // never render it twice.
              const rawSubtitle = eventSubtitle(event);
              const subtitle = rawSubtitle && rawSubtitle !== event.title ? rawSubtitle : null;

              return (
                <li key={index} className="rounded-xl bg-overlay-faint p-3 ring-1 ring-border">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {emoji ? <span aria-hidden="true">{emoji}</span> : null}
                      {event.title}
                    </p>
                    {event.category === "shift" ? (
                      event.timing.status === "resolved" ? (
                        <TimeRange
                          start={event.timing.startLocalTime}
                          end={event.timing.endLocalTime}
                          className="text-xs text-muted"
                        />
                      ) : (
                        <span className="text-xs text-muted">השעה טרם מוגדרת</span>
                      )
                    ) : null}
                  </div>
                  {subtitle || event.certainty === "tentative" || event.shadow || event.changeNote ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {subtitle}
                      {event.certainty === "tentative" ? <Badge tone="warning">משוער</Badge> : null}
                      {event.shadow ? <Badge tone="primary">חפיפה / צל</Badge> : null}
                      {event.changeNote ? <span className="w-full text-muted-2">{event.changeNote}</span> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </section>
  );
}
