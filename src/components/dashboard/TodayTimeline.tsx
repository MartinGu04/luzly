import { Check, Circle } from "lucide-react";
import type { ReactNode } from "react";
import type { LocalNow } from "@/lib/domain/localNow";
import type { PersonalDutyAction, PersonalEventView } from "@/lib/readModels/types";
import { assignmentEmoji, dutyFamilyEmoji } from "@/lib/presentation/emoji";
import { dutyFamilyLabel, periodLabel, roleLabel } from "@/lib/presentation/labels";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { TimeRange } from "./TimeRange";

interface TodayTimelineProps {
  todayEvents: PersonalEventView[];
  todayDutyActions: PersonalDutyAction[];
  localNow: LocalNow;
}

type TimelineStatus = "past" | "current" | "future";

interface TimelineItem {
  key: string;
  minute: number;
  title: string;
  emoji: string | null;
  subtitle: string | null;
  timeLabel: ReactNode;
  status: TimelineStatus;
  tentative: boolean;
}

/** "HH:mm" -> minute-of-day. All inputs here are already server-validated, so this never needs to handle garbage. */
function parseClock(clock: string): number {
  const [hour, minute] = clock.split(":").map(Number);
  return hour * 60 + minute;
}

function statusOf(startMinute: number, endMinute: number, nowMinute: number): TimelineStatus {
  if (nowMinute < startMinute) return "future";
  if (nowMinute >= endMinute) return "past";
  return "current";
}

/**
 * "היום שלי" -- a vertical timeline built from `todayEvents` plus today's
 * duty check-in actions. Every timing value comes from the read model's
 * server-resolved `timing`/`localTime` -- nothing is re-parsed or guessed
 * here. Events without a resolvable hour render in a separate "ללא שעה"
 * section rather than being placed (or skipped) arbitrarily.
 */
export function TodayTimeline({ todayEvents, todayDutyActions, localNow }: TodayTimelineProps) {
  const timedItems: TimelineItem[] = [];
  const allDayItems: TimelineItem[] = [];

  for (const [index, event] of todayEvents.entries()) {
    if (event.timing.status === "resolved") {
      const { startLocalTime, endLocalTime } = event.timing;
      const startMinute = parseClock(startLocalTime);
      const rawEndMinute = parseClock(endLocalTime);
      // An overnight shift's end clock (e.g. "07:30") reads numerically
      // before its start -- push it a day forward on this same comparison
      // timeline, exactly like the domain's own minute arithmetic does.
      const endMinute = rawEndMinute <= startMinute ? rawEndMinute + 24 * 60 : rawEndMinute;
      timedItems.push({
        key: `event-${index}`,
        minute: startMinute,
        title: event.title,
        emoji: assignmentEmoji(event),
        subtitle: describeEvent(event),
        timeLabel: <TimeRange start={startLocalTime} end={endLocalTime} />,
        status: statusOf(startMinute, endMinute, localNow.minuteOfDay),
        tentative: event.certainty === "tentative",
      });
    } else {
      allDayItems.push({
        key: `event-${index}`,
        minute: 0,
        title: event.title,
        emoji: assignmentEmoji(event),
        subtitle: describeEvent(event),
        timeLabel: null,
        status: "future",
        tentative: event.certainty === "tentative",
      });
    }
  }

  for (const [index, action] of todayDutyActions.entries()) {
    const minute = parseClock(action.localTime);
    timedItems.push({
      key: `duty-action-${index}`,
      minute,
      title: "בדיקת תורנות",
      emoji: dutyFamilyEmoji(action.dutyFamily),
      subtitle: dutyFamilyLabel(action.dutyFamily),
      timeLabel: <span dir="ltr">{action.localTime}</span>,
      status: localNow.minuteOfDay >= minute ? "past" : "future",
      tentative: false,
    });
  }

  timedItems.sort((a, b) => a.minute - b.minute);

  if (timedItems.length === 0 && allDayItems.length === 0) {
    return (
      <Panel variant="panel">
        <h3 className="text-sm font-semibold text-foreground">היום שלי</h3>
        <p className="mt-3 text-sm text-muted">אין פריטים מתוזמנים היום.</p>
      </Panel>
    );
  }

  return (
    <Panel variant="panel">
      <h3 className="text-sm font-semibold text-foreground">היום שלי</h3>

      {timedItems.length > 0 ? (
        <ol className="relative mt-4">
          <div
            aria-hidden="true"
            className="absolute top-1 bottom-1 w-px bg-overlay-strong"
            style={{ insetInlineStart: "15px" }}
          />
          {timedItems.map((item) => (
            <li key={item.key} className="relative flex gap-3 pb-5 last:pb-0">
              <div className="relative z-10 flex w-8 shrink-0 justify-center pt-0.5">
                <TimelineDot status={item.status} />
              </div>
              <div className={`min-w-0 flex-1 ${item.status === "past" ? "opacity-55" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {item.emoji ? (
                      <span aria-hidden="true" className="text-xs">
                        {item.emoji}
                      </span>
                    ) : null}
                    {item.title}
                  </p>
                  <span className="text-xs text-muted">{item.timeLabel}</span>
                </div>
                {item.subtitle || item.tentative ? (
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    {item.subtitle}
                    {item.tentative ? <Badge tone="warning">משוער</Badge> : null}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {allDayItems.length > 0 ? (
        <div className={timedItems.length > 0 ? "mt-2 border-t border-border pt-4" : "mt-4"}>
          <p className="text-xs font-medium text-muted-2">ללא שעה</p>
          <ul className="mt-2 space-y-2">
            {allDayItems.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 rounded-lg bg-overlay-faint px-3 py-2">
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  {item.emoji ? (
                    <span aria-hidden="true" className="text-xs">
                      {item.emoji}
                    </span>
                  ) : null}
                  {item.title}
                </span>
                {item.tentative ? <Badge tone="warning">משוער</Badge> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

function TimelineDot({ status }: { status: TimelineStatus }) {
  if (status === "current") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Circle className="h-1.5 w-1.5 fill-current" aria-hidden="true" />
      </span>
    );
  }
  if (status === "past") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-overlay-strong text-muted">
        <Check className="h-2.5 w-2.5" aria-hidden="true" strokeWidth={3} />
      </span>
    );
  }
  return <span className="mt-1 h-2 w-2 rounded-full bg-border-strong" aria-hidden="true" />;
}

function describeEvent(event: PersonalEventView): string | null {
  if (event.category === "shift") {
    const parts = [roleLabel(event.role), periodLabel(event.period)].filter(
      (part): part is string => Boolean(part),
    );
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (event.category === "duty" && event.dutyFamily) {
    return dutyFamilyLabel(event.dutyFamily);
  }
  return null;
}
