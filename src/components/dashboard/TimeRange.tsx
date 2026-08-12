interface TimeRangeProps {
  start: string;
  end: string;
  className?: string;
}

/**
 * "07:30 — 19:30", forced LTR so the bidi algorithm never reorders the two
 * times relative to the dash inside surrounding Hebrew RTL text.
 */
export function TimeRange({ start, end, className = "" }: TimeRangeProps) {
  return (
    <span dir="ltr" className={`tabular-nums ${className}`}>
      {start} — {end}
    </span>
  );
}
