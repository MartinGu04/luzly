import type { LocalNow } from "@/lib/domain/localNow";
import { firstNameOf, greetingForMinuteOfDay } from "@/lib/presentation/greeting";
import { formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
import { LiveClock } from "./LiveClock";

interface HeaderProps {
  personName: string;
  localNow: LocalNow;
}

function minuteOfDayToClock(minute: number): string {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Compact, personal top-of-dashboard header: greeting + date on one side, a live clock on the other. */
export function Header({ personName, localNow }: HeaderProps) {
  const greeting = greetingForMinuteOfDay(localNow.minuteOfDay);
  const firstName = firstNameOf(personName);
  const dateLabel = formatHebrewWeekdayAndDate(localNow.date);

  return (
    <header className="animate-fade-up flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        {dateLabel ? <p className="mt-1 text-sm text-muted">{dateLabel}</p> : null}
      </div>
      <LiveClock initialTime={minuteOfDayToClock(localNow.minuteOfDay)} className="shrink-0 pt-1" />
    </header>
  );
}
