import type { LocalNow } from "@/lib/domain/localNow";
import { formatHebrewCalendarDate, getHolidayContext } from "@/lib/presentation/hebrewCalendar";
import { firstNameOf, greetingEmojiForMinuteOfDay, greetingForMinuteOfDay } from "@/lib/presentation/greeting";
import { formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
import { LiveClock } from "./LiveClock";

interface HeaderProps {
  personName: string;
  localNow: LocalNow;
}

function minuteOfDayToClock(minute: number): string {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

/** Compact, personal top-of-dashboard header: greeting + date on one side, a live clock capsule on the other. */
export function Header({ personName, localNow }: HeaderProps) {
  const greeting = greetingForMinuteOfDay(localNow.minuteOfDay);
  const emoji = greetingEmojiForMinuteOfDay(localNow.minuteOfDay);
  const firstName = firstNameOf(personName);
  const gregorianLabel = formatHebrewWeekdayAndDate(localNow.date);
  const hebrewCalendarLabel = formatHebrewCalendarDate(localNow.date);
  const dateLabel = [gregorianLabel, hebrewCalendarLabel].filter(Boolean).join(" · ");
  const holiday = getHolidayContext(localNow.date);

  return (
    <header className="animate-fade-up flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 truncate text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          <span>
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </span>
          <span aria-hidden="true" className="text-xl sm:text-2xl">
            {emoji}
          </span>
        </h1>
        {holiday ? (
          <div className="mt-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-overlay-soft px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-border">
              <span aria-hidden="true">{holiday.emoji}</span>
              {holiday.label}
            </span>
          </div>
        ) : null}
        {dateLabel ? <p className={`text-sm text-muted ${holiday ? "mt-0.5" : "mt-1.5"}`}>{dateLabel}</p> : null}
      </div>
      <div className="shrink-0 rounded-full bg-overlay-soft px-4 py-2 ring-1 ring-border">
        <LiveClock initialTime={minuteOfDayToClock(localNow.minuteOfDay)} />
      </div>
    </header>
  );
}
