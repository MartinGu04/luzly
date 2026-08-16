import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import type { CalendarGridCell } from "@/lib/domain/calendarMonth";
import type { ScheduleEveryoneDayView, SchedulePeriodStaffingView } from "@/lib/presentation/scheduleEveryone";
import {
  CalendarDayCell,
  CalendarWeekRow,
  CalendarWeekdayHeader,
  IndicatorChip,
  OverflowChip,
  OutOfMonthCell,
  chunkIntoWeeks,
} from "./CalendarSurface";
import type { DayMeta } from "./types";

interface EveryoneMonthGridProps {
  /** Sunday-first, always exactly 6 complete weeks (42 cells) -- see `buildMonthGrid`. */
  grid: CalendarGridCell[];
  days: Record<string, DayMeta>;
  dayViews: Record<string, ScheduleEveryoneDayView>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
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
  toneClassName: string;
}

/**
 * A single at-a-glance line for one period: whichever role-coverage
 * message is most urgent (missing beats not_evaluable beats partial), or
 * -- when both roles are fully covered -- the staffed names themselves.
 * Never a second coverage judgment: both `message`/`status` here are
 * carried through unchanged from the domain's own `roleCoverage`
 * diagnostic (PR #24 §17). Deliberately a short string -- the shared
 * `IndicatorChip` this feeds truncates it below `sm:` anyway, but keeping
 * it short here means it reads cleanly even where it does show.
 */
function summarizePeriod(view: SchedulePeriodStaffingView | null): PeriodSummary {
  if (!view) return { text: "אין נתונים", toneClassName: "text-muted-2" };

  const messages = [view.technicians.message, view.supervisors.message].filter(
    (message): message is string => message !== null,
  );
  if (messages.length > 0) {
    const toneClassName =
      view.technicians.status === "missing" || view.supervisors.status === "missing"
        ? "text-critical"
        : view.technicians.status === "not_evaluable" || view.supervisors.status === "not_evaluable"
          ? "text-muted-2"
          : "text-warning";
    return { text: messages.join(" · "), toneClassName };
  }

  const names = [...view.technicians.people, ...view.supervisors.people].map((person) => person.name);
  return { text: names.length > 0 ? names.join(", ") : "—", toneClassName: "text-muted" };
}

/**
 * The day/night staffing summary content for one in-month cell -- exactly
 * two `IndicatorChip`s (day, night), the SAME shared component and 2-line
 * budget `CalendarGrid` uses for its own personal-event indicators, plus a
 * duties/absences "+N" overflow when there's anything beyond that (PR #38
 * shell-unification round, §15/§16 of the brief: date, day status, night
 * status, then an overflow -- never a taller cell). This is what lets
 * Everyone's greater information density fit the exact same cell height as
 * Personal: the geometry is shared by construction, not by coincidence.
 */
function StaffingIndicators({ dayView }: { dayView: ScheduleEveryoneDayView | undefined }) {
  const day = summarizePeriod(dayView?.day ?? null);
  const night = summarizePeriod(dayView?.night ?? null);
  const extraCount = (dayView?.duties.length ?? 0) + (dayView?.absences.length ?? 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
      <IndicatorChip
        emoji="☀️"
        label={day.text}
        toneClassName={day.toneClassName}
        statusDotClassName={statusDotClass(dayView?.day?.coverageStatus ?? null)}
      />
      <IndicatorChip
        emoji="🌙"
        label={night.text}
        toneClassName={night.toneClassName}
        className="hidden sm:flex"
        statusDotClassName={statusDotClass(dayView?.night?.coverageStatus ?? null)}
      />
      {extraCount > 0 ? (
        <>
          <OverflowChip count={extraCount} className="sm:hidden" />
          <OverflowChip count={extraCount} className="hidden sm:block" />
        </>
      ) : null}
    </div>
  );
}

/**
 * "כולם" mode's month grid (PR #24 §14/§15/§21/§23) -- a dedicated team
 * staffing calendar, not the personal grid with names dumped in. Every
 * date cell answers "who staffs day/night, and is anything missing?" at a
 * glance, via the exact same compact `IndicatorChip` language `CalendarGrid`
 * uses for personal events -- day status on one line, night status on the
 * next, then a duties/absences "+N" overflow. Below `sm:`, each period's
 * chip collapses to its own coverage-colored dot (full/partial/missing/no-
 * data) instead of an emoji, so the mobile view keeps its semantic-color
 * read without needing truncated text. Tapping/selecting a date is the same
 * interaction pattern as the personal calendar's `CalendarGrid`; the FULL
 * picture lives in the selected-day panel next to/below this grid, never
 * crammed into the cell itself.
 *
 * Every structural piece (weekday header, week rows, cell shell, height
 * budget, indicator chips) comes from `CalendarSurface` -- the exact same
 * primitives `CalendarGrid` uses, so the two calendar surfaces can never
 * drift into different geometry. Only the CONTENT fed into that shared
 * shell (`StaffingIndicators`, sourced from `ScheduleEveryoneDayView`) is
 * Everyone's own.
 */
export function EveryoneMonthGrid({ grid, days, dayViews, selectedDate, onSelectDate }: EveryoneMonthGridProps) {
  const weeks = chunkIntoWeeks(grid);

  return (
    <div>
      <CalendarWeekdayHeader />

      <div className="flex flex-col pt-2">
        {weeks.map((week, weekIndex) => {
          const isFirstRow = weekIndex === 0;
          const isLastRow = weekIndex === weeks.length - 1;

          return (
            <CalendarWeekRow key={weekIndex} week={week} isFirstRow={isFirstRow} isLastRow={isLastRow}>
              {week.map((cell, index) => {
                if (!cell.inMonth) {
                  return <OutOfMonthCell key={cell.date} cell={cell} columnIndex={index} isFirstRow={isFirstRow} />;
                }

                const date = cell.date;
                const meta = days[date];
                if (!meta) return <div key={date} aria-hidden="true" />;

                const isSelected = date === selectedDate;

                return (
                  <CalendarDayCell
                    key={date}
                    date={date}
                    meta={meta}
                    columnIndex={index}
                    isFirstRow={isFirstRow}
                    isSelected={isSelected}
                    onSelect={onSelectDate}
                    headerExtra={
                      meta.holiday ? (
                        <span aria-hidden="true" className="text-[10px] sm:text-xs">
                          {meta.holiday.emoji}
                        </span>
                      ) : null
                    }
                  >
                    <StaffingIndicators dayView={dayViews[date]} />
                  </CalendarDayCell>
                );
              })}
            </CalendarWeekRow>
          );
        })}
      </div>
    </div>
  );
}
