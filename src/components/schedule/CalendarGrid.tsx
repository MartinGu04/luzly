import { SHORT_WEEKDAY_LABELS } from "@/lib/presentation/hebrewDate";
import { assignmentEmoji } from "@/lib/presentation/emoji";
import type { PersonalEventView } from "@/lib/readModels/types";
import type { DayMeta } from "./types";

interface CalendarGridProps {
  /** Sunday-first, padded to complete weeks -- see `buildMonthGrid`. */
  grid: (string | null)[];
  days: Record<string, DayMeta>;
  eventsByDate: Record<string, PersonalEventView[]>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  /**
   * Event dates of every currently-running personal shift. Deliberately
   * keyed by the shift's own Event date, not `localNow.date` -- an
   * overnight shift still active after midnight keeps its (now-yesterday)
   * date, so the live accent stays on that date's cell, never on "today"'s
   * cell unless a shift's own date actually IS today.
   */
  activeShiftDates: string[];
}

/**
 * The Sunday-first 7-column month grid. Purely presentational -- selection
 * state lives in the client parent (`ScheduleCalendar`) so this component
 * has no state of its own and is trivial to render/test in isolation.
 * Cells never show role/title text -- only the day number and small
 * semantic shift emoji, matching the restrained "not an Excel grid"
 * direction: a full shift breakdown belongs to the selected-day panel.
 */
export function CalendarGrid({
  grid,
  days,
  eventsByDate,
  selectedDate,
  onSelectDate,
  activeShiftDates,
}: CalendarGridProps) {
  const activeShiftDateSet = new Set(activeShiftDates);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 px-0.5 pb-2 text-center text-[11px] font-medium text-muted-2 sm:text-xs">
        {SHORT_WEEKDAY_LABELS.map((label, index) => (
          <span key={index}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {grid.map((date, index) => {
          if (!date) return <div key={`blank-${index}`} aria-hidden="true" />;

          const meta = days[date];
          if (!meta) return <div key={date} aria-hidden="true" />;

          const dayEvents = eventsByDate[date] ?? [];
          const emojis = Array.from(
            new Set(dayEvents.map((event) => assignmentEmoji(event)).filter((emoji): emoji is string => Boolean(emoji))),
          );
          const hasTentative = dayEvents.some((event) => event.certainty === "tentative");
          const isSelected = date === selectedDate;
          const isActiveShiftDate = activeShiftDateSet.has(date);

          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
              aria-pressed={isSelected}
              aria-label={meta.dateLabel}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:rounded-2xl sm:text-base ${
                isSelected
                  ? "bg-overlay-strong ring-1 ring-border-strong"
                  : "hover:bg-overlay-soft"
              } ${meta.isPast && !isSelected ? "opacity-60" : ""}`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full font-medium sm:h-7 sm:w-7 ${
                  isActiveShiftDate
                    ? "bg-primary text-primary-foreground"
                    : meta.isToday
                      ? "text-primary ring-1 ring-primary"
                      : "text-foreground"
                }`}
              >
                {meta.dayNumber}
              </span>
              <span aria-hidden="true" className="flex h-3 items-center gap-1 text-[10px] leading-none sm:text-xs">
                {emojis.join(" ")}
                {hasTentative ? <span className="h-1.5 w-1.5 rounded-full bg-warning" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
