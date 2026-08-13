import type { MinuteInterval } from "@/lib/domain/shiftSchedule";

const MINUTES_PER_DAY = 1440;

/**
 * A schedule-timeline minute (which, per `MinuteInterval`, can exceed 1439
 * for an overnight span) as a wall-clock "HH:mm" -- wrapped modulo 1440,
 * padded to two digits. No `Date`/UTC anywhere. Negative input (never
 * produced by this domain, but handled defensively) wraps the same way.
 */
export function formatScheduleMinute(minute: number): string {
  const wrapped = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(wrapped / 60);
  const min = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "05:30–07:30" -- the interval's own start/end, in the order the domain already gives them. Never merges or recomputes. */
export function formatMinuteInterval(interval: MinuteInterval): string {
  return `${formatScheduleMinute(interval.startMinute)}–${formatScheduleMinute(interval.endMinute)}`;
}

/** One formatted string per interval, in the same order as `intervals` -- the domain's own gap-detection order is preserved exactly. */
export function formatMissingIntervals(intervals: readonly MinuteInterval[]): string[] {
  return intervals.map(formatMinuteInterval);
}
