import Link from "next/link";
import { formatMonthParam, shiftCalendarMonth, type CalendarMonthKey } from "@/lib/domain/calendarMonth";
import type { ManagerRangeKey } from "@/lib/domain/dateRange";
import { formatHebrewMonthYear } from "@/lib/presentation/hebrewDate";
import { buildManagerHref, type ManagerHrefParams } from "@/lib/presentation/managerUrl";

interface ManagerRangeSelectorProps {
  current: ManagerHrefParams;
  /** The resolved current month -- only present when `current.range === "month"`. */
  currentMonth: CalendarMonthKey | null;
}

const FIXED_RANGE_OPTIONS: { key: Exclude<ManagerRangeKey, "month">; label: string }[] = [
  { key: "today", label: "היום" },
  { key: "7d", label: "7 ימים" },
  { key: "30d", label: "30 יום" },
];

const TAB_BASE =
  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const MONTH_ARROW_CLASS =
  "flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-sm font-medium text-muted transition-colors duration-200 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function monthHref(current: ManagerHrefParams, month: CalendarMonthKey): string {
  return buildManagerHref({ ...current, range: "month", month: formatMonthParam(month) });
}

/** The active month-mode control -- one coherent pill (see the component's own docstring), never a generic label plus loose arrows. */
function ActiveMonthNav({ current, currentMonth }: { current: ManagerHrefParams; currentMonth: CalendarMonthKey }) {
  const prevMonth = shiftCalendarMonth(currentMonth, -1);
  const nextMonth = shiftCalendarMonth(currentMonth, 1);
  const prevLabel = formatHebrewMonthYear(prevMonth.year, prevMonth.month) ?? "";
  const nextLabel = formatHebrewMonthYear(nextMonth.year, nextMonth.month) ?? "";
  const currentLabel = formatHebrewMonthYear(currentMonth.year, currentMonth.month) ?? "החודש";

  return (
    <nav aria-label="ניווט חודשים" className="inline-flex items-center gap-0.5 rounded-full bg-surface-1 p-1 ring-1 ring-border">
      <Link href={monthHref(current, prevMonth)} aria-label="חודש קודם" className={MONTH_ARROW_CLASS}>
        <span aria-hidden="true">‹</span>
        {prevLabel}
      </Link>
      <span className="px-1.5 text-sm font-semibold text-primary" aria-current="page">
        {currentLabel}
      </span>
      <Link href={monthHref(current, nextMonth)} aria-label="חודש הבא" className={MONTH_ARROW_CLASS}>
        {nextLabel}
        <span aria-hidden="true">›</span>
      </Link>
    </nav>
  );
}

/**
 * Server-rendered range switch, plain `Link`s only (no client JS) --
 * every other param (`person`/`category`) is preserved via
 * `buildManagerHref`.
 *
 * Month mode (redesign): a generic "החודש" tab only ever appears WITHOUT
 * navigation arrows (switching into month mode, nothing to navigate yet).
 * The moment it's active, that generic tab is replaced entirely by one
 * coherent pill showing the real selected month -- "אוגוסט 2026" -- with
 * prev/next as part of the SAME control, each carrying its OWN target
 * month's name ("‹ יולי 2026" / "ספטמבר 2026 ›") rather than a bare arrow.
 * A generic label sitting next to loose arrows read as two unrelated
 * things and never made "30 יום" (rolling) vs. month (one specific
 * calendar month) obviously different at a glance -- the concrete month
 * name is the fix, not the arrows' existence.
 *
 * The active tab carries a real `ring-1 ring-border` (not just its own
 * `bg-surface-1` against the container's `bg-overlay-soft`) -- a filled
 * white/dark pill on a barely-tinted container of the same family reads as
 * almost the same color in light mode, especially at this "surface-1 on
 * overlay-soft" flatness where the underlying hue is identical and only
 * opacity differs. The ring gives the selected state a real edge in both
 * themes, the same fix `DutyViewToggle`'s active tab already uses.
 */
export function ManagerRangeSelector({ current, currentMonth }: ManagerRangeSelectorProps) {
  const isMonthActive = current.range === "month" && currentMonth !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="טווח תאריכים" className="inline-flex items-center gap-1 rounded-full bg-overlay-soft p-1">
        {FIXED_RANGE_OPTIONS.map((option) => {
          const isActive = current.range === option.key;
          const href = buildManagerHref({ ...current, range: option.key, month: null });

          return (
            <Link
              key={option.key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`${TAB_BASE} ${isActive ? "bg-surface-1 text-primary ring-1 ring-border" : "text-muted hover:text-foreground"}`}
            >
              {option.label}
            </Link>
          );
        })}

        {!isMonthActive ? (
          <Link
            href={buildManagerHref({ ...current, range: "month", month: current.month })}
            aria-current={current.range === "month" ? "page" : undefined}
            className={`${TAB_BASE} ${current.range === "month" ? "bg-surface-1 text-primary ring-1 ring-border" : "text-muted hover:text-foreground"}`}
          >
            החודש
          </Link>
        ) : null}
      </nav>

      {isMonthActive && currentMonth ? <ActiveMonthNav current={current} currentMonth={currentMonth} /> : null}
    </div>
  );
}
