interface ScheduleHeaderProps {
  monthLabel: string | null;
  monthRangeSubtitle: string | null;
}

/**
 * "הלוח שלי" page title + the displayed month, mirroring the dashboard
 * header's restrained hierarchy: title strongest, month secondary,
 * optional Hebrew-calendar range smallest.
 *
 * The range subtitle line is deliberately always rendered at the same
 * height, whether or not `monthRangeSubtitle` has content -- some months
 * (e.g. one that spans a Hebrew-year boundary, see `formatHebrewMonthRange`)
 * legitimately have no range to show, and letting that line collapse
 * shifted every element below it (including the calendar itself) by that
 * exact amount, month to month -- part of the PR #38 follow-up jump fix.
 */
export function ScheduleHeader({ monthLabel, monthRangeSubtitle }: ScheduleHeaderProps) {
  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">הלוח שלי</h1>
      {monthLabel ? <p className="mt-1.5 text-lg font-semibold text-foreground sm:text-xl">{monthLabel}</p> : null}
      <p className="mt-0.5 text-xs text-muted" aria-hidden={monthRangeSubtitle ? undefined : "true"}>
        {monthRangeSubtitle ?? " "}
      </p>
    </div>
  );
}
