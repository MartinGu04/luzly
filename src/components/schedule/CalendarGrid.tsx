import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { weekOfYear } from "@/lib/domain/weekOfYear";
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

/** At most this many compact event labels show inside one day cell before the rest collapse into a "+N" indicator. */
const MAX_LABELS_PER_DAY = 2;

/** A Sunday-first 7-cell slice of `grid` -- one calendar row. */
function chunkIntoWeeks(grid: (string | null)[]): (string | null)[][] {
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7));
  return weeks;
}

/** The Sunday-first week-of-year for a row, from its first real (non-null) date -- see `weekOfYear` for why any date in the row gives the same result. */
function weekRowNumber(week: (string | null)[]): number | null {
  const firstReal = week.find((date): date is string => date !== null);
  if (!firstReal) return null;
  const parsed = parseCalendarDate(firstReal);
  return parsed ? weekOfYear(parsed) : null;
}

/**
 * The Sunday-first month grid, now with a controlled (not `aspect-square`)
 * row height, a compact readable event label inside each populated day
 * (at most `MAX_LABELS_PER_DAY`, then a "+N" overflow indicator), and a
 * small secondary week-number gutter beside every row. Purely
 * presentational -- selection state lives in the client parent
 * (`ScheduleCalendar`) so this component has no state of its own and is
 * trivial to render/test in isolation. Event labels come straight from
 * `PersonalEventView.title` -- the same already-safe, already-formatted
 * string every other screen shows (SelectedDayPanel, dashboard, ...);
 * this component never parses `rawValue` or invents its own abbreviation.
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
  const weeks = chunkIntoWeeks(grid);

  return (
    <div>
      <div className="flex items-stretch gap-1 px-0.5 pb-2 sm:gap-1.5">
        <span aria-hidden="true" className="w-5 shrink-0 sm:w-6" />
        <div className="grid flex-1 grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-2 sm:gap-1.5 sm:text-xs">
          {SHORT_WEEKDAY_LABELS.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 sm:gap-1.5">
        {weeks.map((week, weekIndex) => {
          const weekNumber = weekRowNumber(week);

          return (
            <div key={weekIndex} className="flex items-stretch gap-1 sm:gap-1.5">
              <div
                className="flex w-5 shrink-0 items-center justify-center text-[10px] font-medium text-muted-2 sm:w-6"
                aria-label={weekNumber !== null ? `שבוע ${weekNumber}` : undefined}
              >
                <span aria-hidden="true">{weekNumber ?? ""}</span>
              </div>

              <div className="grid flex-1 grid-cols-7 gap-1 sm:gap-1.5">
                {week.map((date, index) => {
                  if (!date) return <div key={`blank-${weekIndex}-${index}`} aria-hidden="true" />;

                  const meta = days[date];
                  if (!meta) return <div key={date} aria-hidden="true" />;

                  const dayEvents = eventsByDate[date] ?? [];
                  const visibleEvents = dayEvents.slice(0, MAX_LABELS_PER_DAY);
                  const overflowCount = dayEvents.length - visibleEvents.length;
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
                      className={`flex h-[58px] flex-col items-stretch gap-0.5 rounded-lg p-1 text-start transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-20 sm:rounded-xl sm:p-1.5 lg:h-[84px] ${
                        isSelected ? "bg-overlay-strong ring-1 ring-border-strong" : "hover:bg-overlay-soft"
                      } ${meta.isPast && !isSelected ? "opacity-60" : ""}`}
                    >
                      <div className="flex shrink-0 items-center justify-between">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium sm:h-6 sm:w-6 sm:text-xs ${
                            isActiveShiftDate
                              ? "bg-primary text-primary-foreground"
                              : meta.isToday
                                ? "text-primary ring-1 ring-primary"
                                : "text-foreground"
                          }`}
                        >
                          {meta.dayNumber}
                        </span>
                        {hasTentative ? (
                          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                        ) : null}
                      </div>

                      {visibleEvents.length > 0 ? (
                        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                          {visibleEvents.map((event, eventIndex) => {
                            const emoji = assignmentEmoji(event);
                            return (
                              <span
                                key={eventIndex}
                                className="truncate rounded bg-overlay-soft px-1 text-[9px] leading-[13px] text-foreground sm:text-[10px] sm:leading-4"
                              >
                                {emoji ? <span aria-hidden="true">{emoji} </span> : null}
                                {event.title}
                              </span>
                            );
                          })}
                          {overflowCount > 0 ? (
                            <span
                              dir="ltr"
                              className="px-1 text-[9px] font-medium leading-[13px] text-muted-2 sm:text-[10px] sm:leading-4"
                            >
                              +{overflowCount}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
