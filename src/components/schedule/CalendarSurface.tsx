import { isWeekendColumn, type CalendarGridCell } from "@/lib/domain/calendarMonth";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { weekOfYear } from "@/lib/domain/weekOfYear";
import { SHORT_WEEKDAY_LABELS } from "@/lib/presentation/hebrewDate";
import type { ReactNode } from "react";
import type { DayMeta } from "./types";

/**
 * The ONE shared cell-height budget for every calendar surface in the app
 * (PR #38 shell-unification round) -- `CalendarGrid` (personal) and
 * `EveryoneMonthGrid` (team staffing) both import this constant rather than
 * declaring their own height classes, so the two can never drift apart.
 * Personal's pre-existing height is the source of truth: Everyone's greater
 * information density is solved by a more compact cell-content renderer
 * (see `EveryoneMonthGrid`'s day/night status chips, reusing `IndicatorChip`/
 * `OverflowChip` from this module), never by growing the cell itself.
 */
export const CALENDAR_CELL_HEIGHT_CLASSES = "h-[58px] sm:h-20 lg:h-[84px]";

/**
 * A shared base-height floor for the desktop selected-day panel
 * (`SelectedDayPanel`/`EveryoneSelectedDayPanel`), so switching perspective
 * on the same date never visibly shrinks/grows the panel just because one
 * mode's content happens to be shorter -- a quiet Personal day and a fully-
 * staffed Everyone day both sit on the same minimum card size. Content that
 * genuinely needs more room (many personal events, many duties/absences)
 * still grows past this floor naturally -- it's a minimum, never a cap.
 */
export const SELECTED_DAY_PANEL_MIN_HEIGHT_CLASS = "sm:min-h-[220px]";

/** A Sunday-first 7-cell slice of `grid` -- one calendar row. Shared by every calendar surface so row-chunking logic can't drift between them. */
export function chunkIntoWeeks(grid: CalendarGridCell[]): CalendarGridCell[][] {
  const weeks: CalendarGridCell[][] = [];
  for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7));
  return weeks;
}

/** The Sunday-first week-of-year for a row, from its first cell's date. */
export function weekRowNumber(week: CalendarGridCell[]): number | null {
  const first = week[0];
  if (!first) return null;
  const parsed = parseCalendarDate(first.date);
  return parsed ? weekOfYear(parsed) : null;
}

/** The plain day-of-month number from a "YYYY-MM-DD" string -- used for outside-month cells, which have no `DayMeta`. */
export function dayNumberFromDate(date: string): number {
  return Number(date.slice(8, 10));
}

/**
 * The shared per-cell grid-line treatment: only a bottom + inline-end
 * border per cell, with the FIRST column additionally drawing its own
 * inline-start edge and the FIRST row its own top edge, so the whole 7x6
 * matrix reads as one bordered rectangle without doubled/thicker shared
 * edges. Identical across every calendar surface.
 */
export function cellBorderClasses(columnIndex: number, isFirstRow: boolean): string {
  const start = columnIndex === 0 ? "border-s" : "";
  const top = isFirstRow ? "border-t" : "";
  return `border-b border-e border-border ${start} ${top}`.trim();
}

/**
 * One compact chip -- a short label plus optional emoji/dot -- for a
 * calendar day cell's content area. Shared by `CalendarGrid` (a personal
 * shift/duty/absence indicator) and `EveryoneMonthGrid` (a day/night
 * staffing summary), so both surfaces budget the exact same per-line
 * height/typography and can never drift into a taller cell independently.
 * Below `sm:` this NEVER renders truncated text -- only a small dot (the
 * item's own semantic status color when `statusDotClassName` is given,
 * otherwise a neutral dot) plus, when there's no status color to carry, the
 * item's own emoji -- so a narrow cell never shows a clipped "…" fragment.
 * The short word label only appears from `sm:` up, where the cell has room
 * for it.
 */
export function IndicatorChip({
  emoji,
  label,
  toneClassName = "text-foreground",
  /** When set, a small colored dot (e.g. coverage full/partial/missing) always represents this item below `sm:`, taking priority over the emoji so the mobile dot-only view keeps its semantic color signal. */
  statusDotClassName,
  /**
   * When set (e.g. `eventColorBgClassName`, `lib/presentation/eventColor.ts`),
   * replaces the chip's default neutral `bg-overlay-soft` with a semantic
   * soft color tint, at every breakpoint -- used only by `CalendarGrid`'s
   * single-person "הלוח שלי" indicators, never by `EveryoneMonthGrid` (which
   * never passes this prop, so its chips are completely unaffected).
   * Deliberately independent of `statusDotClassName`/emoji rendering below --
   * this never hides/changes the emoji or label, only the chip's background.
   */
  categoryBgClassName,
  className = "",
}: {
  emoji: string | null;
  label: string;
  toneClassName?: string;
  statusDotClassName?: string;
  categoryBgClassName?: string;
  className?: string;
}) {
  return (
    <span
      className={`flex min-w-0 items-center gap-1 rounded ${categoryBgClassName ?? "bg-overlay-soft"} px-1 text-[9px] leading-[13px] sm:text-[10px] sm:leading-4 ${toneClassName} ${className}`}
    >
      {statusDotClassName ? (
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full sm:hidden ${statusDotClassName}`} />
      ) : null}
      {emoji ? (
        <span aria-hidden="true" className={`shrink-0 ${statusDotClassName ? "hidden sm:inline" : ""}`}>
          {emoji}
        </span>
      ) : statusDotClassName ? null : (
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong sm:hidden" />
      )}
      <span className="hidden truncate sm:inline">{label}</span>
    </span>
  );
}

/** The "+N" overflow chip shown once a cell's content exceeds its 2-line indicator budget. Shared so both surfaces collapse overflow at the exact same point/height. */
export function OverflowChip({ count, className = "" }: { count: number; className?: string }) {
  return (
    <span
      dir="ltr"
      className={`px-1 text-[9px] font-medium leading-[13px] text-muted-2 sm:text-[10px] sm:leading-4 ${className}`}
    >
      +{count}
    </span>
  );
}

/** The shared weekday-header row (week-number gutter spacer + 7 short weekday labels) sitting above every calendar surface's grid body. */
export function CalendarWeekdayHeader() {
  return (
    <div className="flex items-stretch gap-1 border-b border-border pb-2 sm:gap-1.5">
      <span aria-hidden="true" className="w-5 shrink-0 sm:w-6" />
      <div className="grid flex-1 grid-cols-7 gap-1 text-center text-[11px] font-medium sm:gap-1.5 sm:text-xs">
        {SHORT_WEEKDAY_LABELS.map((label, index) => (
          <span key={index} className={isWeekendColumn(index) ? "text-muted" : "text-muted-2"}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface CalendarWeekRowProps {
  week: CalendarGridCell[];
  isFirstRow: boolean;
  isLastRow: boolean;
  children: ReactNode;
}

/**
 * One calendar row: the week-number gutter plus the 7-column cell grid,
 * with outer-corner rounding applied only on the first/last row via
 * `overflow-hidden` on the row's own grid container -- shared so the
 * "whole matrix rounds, individual cells stay flat" contract can't drift
 * between calendar surfaces.
 */
export function CalendarWeekRow({ week, isFirstRow, isLastRow, children }: CalendarWeekRowProps) {
  const weekNumber = weekRowNumber(week);

  return (
    <div className="flex items-stretch">
      <div
        className="flex w-5 shrink-0 items-center justify-center text-[10px] font-medium text-muted-2 sm:w-6"
        aria-label={weekNumber !== null ? `שבוע ${weekNumber}` : undefined}
      >
        <span aria-hidden="true">{weekNumber ?? ""}</span>
      </div>
      <div
        className={`grid flex-1 grid-cols-7 overflow-hidden ${isFirstRow ? "rounded-t-xl" : ""} ${
          isLastRow ? "rounded-b-xl" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

interface OutOfMonthCellProps {
  cell: CalendarGridCell;
  columnIndex: number;
  isFirstRow: boolean;
}

/** A non-interactive, dimmed adjacent-month cell, participating in the same bordered grid geometry as a real day cell. Shared so leading/trailing padding can never look like a "detached, disabled card" in one surface but not the other. */
export function OutOfMonthCell({ cell, columnIndex, isFirstRow }: OutOfMonthCellProps) {
  const isWeekend = isWeekendColumn(columnIndex);
  return (
    <div
      aria-hidden="true"
      className={`flex ${CALENDAR_CELL_HEIGHT_CLASSES} items-start justify-start p-1 sm:p-1.5 ${cellBorderClasses(columnIndex, isFirstRow)} ${
        isWeekend ? "bg-weekend-tint" : ""
      }`}
    >
      <span className="text-[11px] font-medium text-muted-2 opacity-40 sm:text-xs">
        {dayNumberFromDate(cell.date)}
      </span>
    </div>
  );
}

interface CalendarDayCellProps {
  date: string;
  meta: DayMeta;
  columnIndex: number;
  isFirstRow: boolean;
  isSelected: boolean;
  onSelect: (date: string) => void;
  /** Rendered next to the day-number badge (e.g. holiday emoji, a tentative-shift dot). */
  headerExtra?: ReactNode;
  /** The day-number badge's own tone override (e.g. Personal's "active shift now" accent). Defaults to today/plain. */
  dayNumberActive?: boolean;
  /** The cell's content area -- at most two `IndicatorChip`s plus an `OverflowChip`, per surface. */
  children: ReactNode;
}

/**
 * The shared in-month day-cell shell: border/weekend/selection/hover
 * treatment, the day-number badge (today/active accents), and a content
 * slot -- used by both `CalendarGrid` and `EveryoneMonthGrid` so their
 * outer cell geometry and interaction states can never diverge. Only the
 * content area's children (and the small header-extra slot) differ per
 * surface.
 */
export function CalendarDayCell({
  date,
  meta,
  columnIndex,
  isFirstRow,
  isSelected,
  onSelect,
  headerExtra,
  dayNumberActive = false,
  children,
}: CalendarDayCellProps) {
  const isWeekend = isWeekendColumn(columnIndex);
  const isPast = meta.isPast && !isSelected;

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      aria-pressed={isSelected}
      aria-label={meta.dateLabel}
      className={`flex ${CALENDAR_CELL_HEIGHT_CLASSES} flex-col items-stretch p-1 text-start transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:p-1.5 ${cellBorderClasses(columnIndex, isFirstRow)} ${
        isSelected
          ? "bg-overlay-strong ring-2 ring-inset ring-primary/40"
          : isWeekend
            ? "bg-weekend-tint hover:bg-overlay-soft"
            : "hover:bg-overlay-soft"
      }`}
    >
      <div className={`flex h-full flex-col gap-0.5 ${isPast ? "opacity-60" : ""}`}>
        <div className="flex shrink-0 items-center justify-between">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium sm:h-6 sm:w-6 sm:text-xs ${
              dayNumberActive
                ? "bg-primary text-primary-foreground"
                : meta.isToday
                  ? "text-primary ring-1 ring-primary"
                  : "text-foreground"
            }`}
          >
            {meta.dayNumber}
          </span>
          <div className="flex shrink-0 items-center gap-1">{headerExtra}</div>
        </div>

        {children}
      </div>
    </button>
  );
}
