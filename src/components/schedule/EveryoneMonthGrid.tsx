import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import type { CalendarGridCell } from "@/lib/domain/calendarMonth";
import { coverageStatusLabel } from "@/lib/presentation/labels";
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

/** The Hebrew accessible name for a period's coverage status, e.g. "יום: חסר" -- never color-only. `null` (no staffing data at all for that period) reads the same "אין נתונים" text `summarizePeriod` already shows visually. */
function statusAccessibleLabel(periodLabel: string, status: CoverageStatus | null): string {
  return `${periodLabel}: ${status === null ? "אין נתונים" : coverageStatusLabel(status)}`;
}

/** One coverage-status dot with a screen-reader-only label -- color alone never carries the status. */
function StatusDot({ label, colorClassName }: { label: string; colorClassName: string }) {
  return (
    <span className="inline-flex shrink-0 items-center">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${colorClassName}`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Mobile-only (below `sm:`) compact summary: BOTH day and night coverage
 * status, each its own labeled dot, on one line, plus an optional "+N"
 * duties/absences overflow -- never just the day status. A narrower cell
 * has room for two small dots but not two full text lines, so this is a
 * deliberately different mobile presentation from the `sm:`+ two-line one
 * below, not a truncated version of it: hiding the ENTIRE night line below
 * `sm:` (as a bare `hidden sm:flex` on a second `IndicatorChip` would) was
 * the bug this fixes -- a fully-staffed day sitting beside a missing night
 * shift used to read as an all-clear green dot on a narrow screen, with the
 * real problem invisible until the viewport widened or the day was opened.
 */
function MobileStaffingSummary({
  dayStatus,
  nightStatus,
  extraCount,
}: {
  dayStatus: CoverageStatus | null;
  nightStatus: CoverageStatus | null;
  extraCount: number;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:hidden" role="group" aria-label="מצב איוש יום ולילה">
      <StatusDot label={statusAccessibleLabel("יום", dayStatus)} colorClassName={statusDotClass(dayStatus)} />
      <StatusDot label={statusAccessibleLabel("לילה", nightStatus)} colorClassName={statusDotClass(nightStatus)} />
      {extraCount > 0 ? <OverflowChip count={extraCount} /> : null}
    </div>
  );
}

/**
 * The day/night staffing summary content for one in-month cell. On `sm:`+,
 * exactly two `IndicatorChip`s (day, night) -- the SAME shared component
 * and 2-line budget `CalendarGrid` uses for its own personal-event
 * indicators -- plus a duties/absences "+N" overflow when there's anything
 * beyond that (PR #38 shell-unification round, §15/§16 of the brief: date,
 * day status, night status, then an overflow -- never a taller cell). Below
 * `sm:`, `MobileStaffingSummary` replaces both text lines with one compact
 * labeled-dot row so day AND night coverage both stay visible at every
 * width -- see its own doc comment for why a bare `hidden sm:flex` on the
 * night line was wrong. Either way, this is what lets Everyone's greater
 * information density fit the exact same cell height as Personal: the
 * geometry is shared by construction, not by coincidence.
 */
function StaffingIndicators({ dayView }: { dayView: ScheduleEveryoneDayView | undefined }) {
  const day = summarizePeriod(dayView?.day ?? null);
  const night = summarizePeriod(dayView?.night ?? null);
  const dayStatus = dayView?.day?.coverageStatus ?? null;
  const nightStatus = dayView?.night?.coverageStatus ?? null;
  const extraCount = (dayView?.duties.length ?? 0) + (dayView?.absences.length ?? 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
      <MobileStaffingSummary dayStatus={dayStatus} nightStatus={nightStatus} extraCount={extraCount} />

      <IndicatorChip emoji="☀️" label={day.text} toneClassName={day.toneClassName} className="hidden sm:flex" />
      <IndicatorChip emoji="🌙" label={night.text} toneClassName={night.toneClassName} className="hidden sm:flex" />
      {extraCount > 0 ? <OverflowChip count={extraCount} className="hidden sm:block" /> : null}
    </div>
  );
}

/**
 * "כולם" mode's month grid (PR #24 §14/§15/§21/§23) -- a dedicated team
 * staffing calendar, not the personal grid with names dumped in. Every
 * date cell answers "who staffs day/night, and is anything missing?" at a
 * glance, via the exact same compact `IndicatorChip` language `CalendarGrid`
 * uses for personal events -- day status on one line, night status on the
 * next, then a duties/absences "+N" overflow. Below `sm:`, `MobileStaffingSummary`
 * shows BOTH day and night as their own labeled, coverage-colored dot on
 * one line -- never just one period's status -- so a narrow viewport can
 * never hide a real missing/partial night (or day) behind the other
 * period's healthier state. Tapping/selecting a date is the same
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
