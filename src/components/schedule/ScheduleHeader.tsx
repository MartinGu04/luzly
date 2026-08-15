interface ScheduleHeaderProps {
  monthLabel: string | null;
  monthRangeSubtitle: string | null;
}

/** "לוח משמרות" page title + the displayed month, mirroring the dashboard header's restrained hierarchy: title strongest, month secondary, optional Hebrew-calendar range smallest. */
export function ScheduleHeader({ monthLabel, monthRangeSubtitle }: ScheduleHeaderProps) {
  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">לוח משמרות</h1>
      {monthLabel ? <p className="mt-1.5 text-lg font-semibold text-foreground sm:text-xl">{monthLabel}</p> : null}
      {monthRangeSubtitle ? <p className="mt-0.5 text-xs text-muted">{monthRangeSubtitle}</p> : null}
    </div>
  );
}
