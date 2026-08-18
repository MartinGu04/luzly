import Link from "next/link";
import { formatMonthParam, shiftCalendarMonth, type CalendarMonthKey } from "@/lib/domain/calendarMonth";
import type { ManagerRangeKey } from "@/lib/domain/dateRange";
import { buildManagerHref, type ManagerHrefParams } from "@/lib/presentation/managerUrl";

interface ManagerRangeSelectorProps {
  current: ManagerHrefParams;
  /** The resolved current month -- only present when `current.range === "month"`. */
  currentMonth: CalendarMonthKey | null;
}

const RANGE_OPTIONS: { key: ManagerRangeKey; label: string }[] = [
  { key: "today", label: "היום" },
  { key: "7d", label: "7 ימים" },
  { key: "30d", label: "30 יום" },
  { key: "month", label: "חודש" },
];

const TAB_BASE =
  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Server-rendered range switch, plain `Link`s only (no client JS) --
 * every other param (`person`/`problems`) is preserved via
 * `buildManagerHref`. When the active range is "month", previous/next
 * month controls appear alongside it, computed via the existing
 * `shiftCalendarMonth` domain helper -- never Date/UTC.
 */
export function ManagerRangeSelector({ current, currentMonth }: ManagerRangeSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="טווח תאריכים" className="inline-flex items-center gap-1 rounded-full bg-overlay-soft p-1">
        {RANGE_OPTIONS.map((option) => {
          const isActive = current.range === option.key;
          const href = buildManagerHref({
            ...current,
            range: option.key,
            month: option.key === "month" ? current.month : null,
          });

          return (
            <Link
              key={option.key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`${TAB_BASE} ${isActive ? "bg-surface-1 text-primary" : "text-muted hover:text-foreground"}`}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      {current.range === "month" && currentMonth ? (
        <div className="inline-flex items-center gap-1">
          <Link
            href={buildManagerHref({
              ...current,
              range: "month",
              month: formatMonthParam(shiftCalendarMonth(currentMonth, -1)),
            })}
            aria-label="חודש קודם"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            ‹
          </Link>
          <Link
            href={buildManagerHref({
              ...current,
              range: "month",
              month: formatMonthParam(shiftCalendarMonth(currentMonth, 1)),
            })}
            aria-label="חודש הבא"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            ›
          </Link>
        </div>
      ) : null}
    </div>
  );
}
