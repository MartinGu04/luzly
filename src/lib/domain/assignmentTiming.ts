import { resolveNowMinuteOnEventTimeline } from "./assignmentTemporalState";
import type { Event } from "./event";
import type { LocalNow } from "./localNow";
import { MINUTES_PER_DAY, resolveEventShiftInterval, type ShiftSchedule } from "./shiftSchedule";

/**
 * A safe, presentation-ready projection of a shift Event's resolved timing,
 * computed once server-side against a specific `LocalNow`. Never re-derived
 * from raw text in the UI -- the client only ever advances this forward
 * using elapsed wall-clock time (see `lib/presentation`).
 *
 * `not_evaluable` covers everything `resolveEventShiftInterval` can't
 * resolve to a concrete interval (duties, unspecified period, an invalid
 * override) -- never an invented start/end/duration.
 */
export type AssignmentTiming =
  | {
      status: "resolved";
      /** "HH:mm", already wrapped onto a 24h clock (an overnight end past midnight reads e.g. "07:30"). */
      startLocalTime: string;
      endLocalTime: string;
      durationMinutes: number;
      /** Minutes elapsed since start, clamped to [0, durationMinutes] as of `now`. */
      elapsedMinutesAtLoad: number;
      /** durationMinutes - elapsedMinutesAtLoad. */
      remainingMinutesAtLoad: number;
      /** 0..100, rounded. */
      progressPercentAtLoad: number;
      /**
       * Minutes until start, but ONLY when `now` and the shift's start both
       * fall on the same event-timeline day-pair (today or the very next
       * day) -- i.e. exactly the cases `resolveNowMinuteOnEventTimeline` can
       * place without ambiguity. Otherwise 0: a shift several days out gets
       * no invented live countdown, only its known calendar date/time.
       */
      minutesUntilStartAtLoad: number;
    }
  | { status: "not_evaluable" };

/**
 * Computes `AssignmentTiming` for one Event as of `now`. Pure and
 * deterministic -- no Date/UTC, reuses `resolveEventShiftInterval` for the
 * actual interval math and `resolveNowMinuteOnEventTimeline` for placing
 * `now` on the shift's own minute timeline (the same placement
 * `classifyAssignmentTemporalState` uses, so the two never disagree).
 */
export function computeAssignmentTiming(
  event: Event,
  schedule: ShiftSchedule,
  now: LocalNow,
): AssignmentTiming {
  const resolution = resolveEventShiftInterval(event, schedule);
  if (resolution.status !== "resolved") return { status: "not_evaluable" };

  const { startMinute, endMinute } = resolution.interval;
  const durationMinutes = endMinute - startMinute;

  const nowMinute = resolveNowMinuteOnEventTimeline(event.date, now);

  let elapsedMinutesAtLoad: number;
  let minutesUntilStartAtLoad: number;

  if (nowMinute === null) {
    // More than a calendar day away in either direction: unambiguously
    // hasn't started (future) or is fully over (past), but too far out for
    // a meaningful minute-level countdown without inventing precision.
    const isFuture = now.date < event.date;
    elapsedMinutesAtLoad = isFuture ? 0 : durationMinutes;
    minutesUntilStartAtLoad = 0;
  } else {
    const offsetFromStart = nowMinute - startMinute;
    elapsedMinutesAtLoad = Math.min(Math.max(offsetFromStart, 0), durationMinutes);
    minutesUntilStartAtLoad = Math.max(-offsetFromStart, 0);
  }

  const remainingMinutesAtLoad = durationMinutes - elapsedMinutesAtLoad;
  const progressPercentAtLoad =
    durationMinutes === 0 ? 0 : Math.round((elapsedMinutesAtLoad / durationMinutes) * 100);

  return {
    status: "resolved",
    startLocalTime: minuteOfDayToClock(startMinute),
    endLocalTime: minuteOfDayToClock(endMinute),
    durationMinutes,
    elapsedMinutesAtLoad,
    remainingMinutesAtLoad,
    progressPercentAtLoad,
    minutesUntilStartAtLoad,
  };
}

/** Wraps a (possibly >1439, for an overnight end) minute-of-day onto "HH:mm". */
function minuteOfDayToClock(minute: number): string {
  const normalized = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(normalized / 60);
  const minuteOfHour = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minuteOfHour).padStart(2, "0")}`;
}
