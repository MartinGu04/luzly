import { assignmentEmoji } from "@/lib/presentation/emoji";
import { periodLabel, roleLabel } from "@/lib/presentation/labels";
import type { PersonalEventView } from "@/lib/readModels/types";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { TimeRange } from "@/components/dashboard/TimeRange";
import type { DayMeta } from "./types";

interface SelectedDayPanelProps {
  dayMeta: DayMeta | null;
  events: PersonalEventView[];
}

function describeShift(event: PersonalEventView): string | null {
  const parts = [roleLabel(event.role), periodLabel(event.period)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The selected calendar day's full detail -- every personal shift on that
 * date, never collapsed to one even when there are several. Shows only
 * what the server already resolved (`timing`) -- never invents a time for
 * a shift whose hour can't be evaluated. Lives in the desktop side column
 * next to the calendar (see `ScheduleCalendar`), stacking below it on
 * mobile. Wrapped in an accessible, addressable `region` -- both a real
 * a11y landmark and how tests scope queries here vs. the calendar grid's
 * own in-cell event labels (Design Pass PR #20 added those; the same
 * event title can now legitimately appear in both places at once).
 */
export function SelectedDayPanel({ dayMeta, events }: SelectedDayPanelProps) {
  if (!dayMeta) return null;

  return (
    <section aria-label="פרטי היום הנבחר">
      <Panel variant="panel">
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
          <p className="mt-3 text-sm text-muted">אין לך משמרת ביום הזה 😌</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {events.map((event, index) => {
              const emoji = assignmentEmoji(event);
              const subtitle = describeShift(event);

              return (
                <li key={index} className="rounded-xl bg-overlay-faint p-3 ring-1 ring-border">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {emoji ? <span aria-hidden="true">{emoji}</span> : null}
                      {event.title}
                    </p>
                    {event.timing.status === "resolved" ? (
                      <TimeRange
                        start={event.timing.startLocalTime}
                        end={event.timing.endLocalTime}
                        className="text-xs text-muted"
                      />
                    ) : (
                      <span className="text-xs text-muted">השעה טרם מוגדרת</span>
                    )}
                  </div>
                  {subtitle || event.certainty === "tentative" || event.shadow ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {subtitle}
                      {event.certainty === "tentative" ? <Badge tone="warning">משוער</Badge> : null}
                      {event.shadow ? <Badge tone="primary">חפיפה / צל</Badge> : null}
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
