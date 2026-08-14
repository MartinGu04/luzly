import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { weekOfYear } from "@/lib/domain/weekOfYear";
import { SHORT_WEEKDAY_LABELS } from "@/lib/presentation/hebrewDate";
import type { ScheduleEveryoneDayView, SchedulePeriodStaffingView } from "@/lib/presentation/scheduleEveryone";
import type { DayMeta } from "./types";

interface EveryoneMonthGridProps {
  /** Sunday-first, padded to complete weeks -- see `buildMonthGrid`. */
  grid: (string | null)[];
  days: Record<string, DayMeta>;
  dayViews: Record<string, ScheduleEveryoneDayView>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

function chunkIntoWeeks(grid: (string | null)[]): (string | null)[][] {
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7));
  return weeks;
}

function weekRowNumber(week: (string | null)[]): number | null {
  const firstReal = week.find((date): date is string => date !== null);
  if (!firstReal) return null;
  const parsed = parseCalendarDate(firstReal);
  return parsed ? weekOfYear(parsed) : null;
}

function statusDotClass(status: CoverageStatus | null): string {
  if (status === null) return "bg-border-strong";
  if (status === "full") return "bg-success";
  if (status === "partial") return "bg-warning";
  if (status === "missing") return "bg-critical";
  return "bg-muted-2";
}

interface PeriodSummary {
  text: string;
  toneClass: string;
}

/**
 * A single at-a-glance line for one period: whichever role-coverage
 * message is most urgent (missing beats not_evaluable beats partial), or
 * -- when both roles are fully covered -- the staffed names themselves.
 * Never a second coverage judgment: both `message`/`status` here are
 * carried through unchanged from the domain's own `roleCoverage`
 * diagnostic (PR #24 §17).
 */
function summarizePeriod(view: SchedulePeriodStaffingView): PeriodSummary {
  const messages = [view.technicians.message, view.supervisors.message].filter(
    (message): message is string => message !== null,
  );
  if (messages.length > 0) {
    const toneClass =
      view.technicians.status === "missing" || view.supervisors.status === "missing"
        ? "text-critical"
        : view.technicians.status === "not_evaluable" || view.supervisors.status === "not_evaluable"
          ? "text-muted-2"
          : "text-warning";
    return { text: messages.join(" · "), toneClass };
  }

  const names = [...view.technicians.people, ...view.supervisors.people].map((person) => person.name);
  return { text: names.length > 0 ? names.join(", ") : "—", toneClass: "text-muted" };
}

function PeriodStrip({ view, icon }: { view: SchedulePeriodStaffingView | null; icon: string | null }) {
  if (!view) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-muted-2 sm:text-[11px]">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        <span>אין נתונים</span>
      </div>
    );
  }

  const summary = summarizePeriod(view);
  return (
    <div className={`flex items-center gap-1 truncate text-[10px] sm:text-[11px] ${summary.toneClass}`}>
      {view.emoji ? <span aria-hidden="true">{view.emoji}</span> : null}
      <span className="truncate">{summary.text}</span>
    </div>
  );
}

/**
 * "כולם" mode's month grid (PR #24 §14/§15/§21/§23) -- a dedicated team
 * staffing calendar, not the personal grid with names dumped in. Every
 * date cell answers "who staffs day/night, and is anything missing?" at a
 * glance. Desktop/tablet shows a compact day/night text summary; below
 * `sm:` (390/430px phones), text gives way to two small coverage dots plus
 * an "extra activity" dot -- still answering "is day/night staffed, is
 * there a problem, is anything else going on" without reproducing a full
 * staffing table in a tiny cell (PR #24 §23). Tapping/selecting a date is
 * the same interaction pattern as the personal calendar's `CalendarGrid`;
 * the FULL picture lives in the selected-day panel next to/below this
 * grid, never crammed into the cell itself.
 */
export function EveryoneMonthGrid({ grid, days, dayViews, selectedDate, onSelectDate }: EveryoneMonthGridProps) {
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

                  const dayView = dayViews[date];
                  const isSelected = date === selectedDate;
                  const extraCount = (dayView?.duties.length ?? 0) + (dayView?.absences.length ?? 0);

                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => onSelectDate(date)}
                      aria-pressed={isSelected}
                      aria-label={meta.dateLabel}
                      className={`flex h-[76px] flex-col items-stretch gap-1 rounded-lg p-1 text-start transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-[104px] sm:rounded-xl sm:p-1.5 lg:h-[124px] ${
                        isSelected ? "bg-overlay-strong ring-1 ring-border-strong" : "hover:bg-overlay-soft"
                      } ${meta.isPast && !isSelected ? "opacity-60" : ""}`}
                    >
                      <div className="flex shrink-0 items-center justify-between">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium sm:h-6 sm:w-6 sm:text-xs ${
                            meta.isToday ? "text-primary ring-1 ring-primary" : "text-foreground"
                          }`}
                        >
                          {meta.dayNumber}
                        </span>
                        {meta.holiday ? (
                          <span aria-hidden="true" className="text-[10px] sm:text-xs">
                            {meta.holiday.emoji}
                          </span>
                        ) : null}
                      </div>

                      {/* Mobile: compact coverage dots only -- no names, no horizontal overflow risk. */}
                      <div className="flex items-center gap-1 sm:hidden">
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${statusDotClass(dayView?.day?.coverageStatus ?? null)}`}
                        />
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${statusDotClass(dayView?.night?.coverageStatus ?? null)}`}
                        />
                        {extraCount > 0 ? (
                          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
                        ) : null}
                      </div>

                      {/* sm+: compact day/night text summary. */}
                      <div className="hidden min-h-0 flex-1 flex-col justify-center gap-1 overflow-hidden sm:flex">
                        <PeriodStrip view={dayView?.day ?? null} icon="☀️" />
                        <PeriodStrip view={dayView?.night ?? null} icon="🌙" />
                      </div>

                      {extraCount > 0 ? (
                        <span dir="ltr" className="hidden text-[9px] font-medium text-muted-2 sm:block">
                          +{extraCount}
                        </span>
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
