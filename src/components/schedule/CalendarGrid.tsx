import { isWeekendColumn } from "@/lib/domain/calendarMonth";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { weekOfYear } from "@/lib/domain/weekOfYear";
import { buildDayIndicators, type CalendarDayIndicator } from "@/lib/presentation/calendarDayIndicator";
import { SHORT_WEEKDAY_LABELS } from "@/lib/presentation/hebrewDate";
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

/** At most this many compact indicators show inside one day cell (on wide-enough layouts) before the rest collapse into a "+N" indicator. Narrower layouts show one fewer -- see the mobile/wide overflow split below. */
const MAX_INDICATORS_PER_DAY = 2;

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

function IndicatorChip({ indicator, className = "" }: { indicator: CalendarDayIndicator; className?: string }) {
  return (
    <span
      className={`truncate rounded bg-overlay-soft px-1 text-[9px] leading-[13px] text-foreground sm:text-[10px] sm:leading-4 ${className}`}
    >
      {indicator.emoji ? <span aria-hidden="true">{indicator.emoji} </span> : null}
      {indicator.label}
    </span>
  );
}

function OverflowChip({ count, className = "" }: { count: number; className?: string }) {
  return (
    <span
      dir="ltr"
      className={`px-1 text-[9px] font-medium leading-[13px] text-muted-2 sm:text-[10px] sm:leading-4 ${className}`}
    >
      +{count}
    </span>
  );
}

/**
 * The Sunday-first month grid for "הלוח שלי" -- optimized for scanning, not
 * reading. Every day cell shows the day number plus, at most, two compact
 * indicators (one below the `sm:` breakpoint, to keep narrow layouts from
 * feeling cramped) covering shifts/duties/absences/holidays, then a "+N"
 * overflow rather than an ever-growing list. The FULL breakdown for a day
 * lives only in `SelectedDayPanel`, next to/below this grid -- this
 * component never tries to say everything about a day, only enough to
 * recognize it at a glance. Purely presentational -- selection state lives
 * in the client parent (`ScheduleCalendar`) so this component has no state
 * of its own and is trivial to render/test in isolation. Indicator labels
 * come from the shared `buildDayIndicators` helper (never invented here),
 * so a day cell and the selected-day detail always agree on what a given
 * event actually is.
 *
 * Thursday-Saturday columns (the Israeli weekend, see
 * `isWeekendColumn`) get a subtle background wash -- both header and
 * cells -- so the week's shape is easy to recognize without being noisy.
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
        <div className="grid flex-1 grid-cols-7 gap-1 text-center text-[11px] font-medium sm:gap-1.5 sm:text-xs">
          {SHORT_WEEKDAY_LABELS.map((label, index) => (
            <span key={index} className={isWeekendColumn(index) ? "text-muted" : "text-muted-2"}>
              {label}
            </span>
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
                  const indicators = buildDayIndicators(dayEvents, meta.holiday);
                  const visibleIndicators = indicators.slice(0, MAX_INDICATORS_PER_DAY);
                  const mobileOverflow = Math.max(indicators.length - 1, 0);
                  const wideOverflow = Math.max(indicators.length - MAX_INDICATORS_PER_DAY, 0);
                  const hasTentative = dayEvents.some((event) => event.certainty === "tentative");
                  const isSelected = date === selectedDate;
                  const isActiveShiftDate = activeShiftDateSet.has(date);
                  const isWeekend = isWeekendColumn(index);

                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => onSelectDate(date)}
                      aria-pressed={isSelected}
                      aria-label={meta.dateLabel}
                      className={`flex h-[58px] flex-col items-stretch gap-0.5 rounded-lg p-1 text-start transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-20 sm:rounded-xl sm:p-1.5 lg:h-[84px] ${
                        isSelected
                          ? "bg-overlay-strong ring-1 ring-border-strong"
                          : isWeekend
                            ? "bg-overlay-faint hover:bg-overlay-soft"
                            : "hover:bg-overlay-soft"
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

                      {visibleIndicators.length > 0 ? (
                        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                          {visibleIndicators[0] ? <IndicatorChip indicator={visibleIndicators[0]} /> : null}
                          {visibleIndicators[1] ? (
                            <IndicatorChip indicator={visibleIndicators[1]} className="hidden sm:block" />
                          ) : null}
                          {mobileOverflow > 0 ? <OverflowChip count={mobileOverflow} className="sm:hidden" /> : null}
                          {wideOverflow > 0 ? (
                            <OverflowChip count={wideOverflow} className="hidden sm:block" />
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
