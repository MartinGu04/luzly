import { isNextCalendarDay } from "./dutyBlocks";
import type { Event } from "./event";
import type { LocalNow } from "./localNow";
import { MINUTES_PER_DAY, resolveEventShiftInterval, type ShiftSchedule } from "./shiftSchedule";

export type AssignmentTemporalState = "current" | "upcoming" | "past" | "not_evaluable";

/**
 * Classifies a shift/duty Event's timing relative to `now`. Non-assignment
 * categories (absence/constraint/status/context/change_note/other/unknown)
 * always come back `not_evaluable` -- this is only meaningful for actual
 * assignments.
 */
export function classifyAssignmentTemporalState(
  event: Event,
  schedule: ShiftSchedule,
  now: LocalNow,
): AssignmentTemporalState {
  if (event.category === "duty") return classifyDutyTemporalState(event, now);
  if (event.category === "shift") return classifyShiftTemporalState(event, schedule, now);
  return "not_evaluable";
}

/**
 * Duties have no invented hourly duration -- only the calendar date decides
 * current/upcoming/past.
 */
function classifyDutyTemporalState(event: Event, now: LocalNow): AssignmentTemporalState {
  if (event.date === now.date) return "current";
  return event.date < now.date ? "past" : "upcoming";
}

function classifyShiftTemporalState(
  event: Event,
  schedule: ShiftSchedule,
  now: LocalNow,
): AssignmentTemporalState {
  const resolution = resolveEventShiftInterval(event, schedule);

  // Unspecified period, or an invalid start/end override: the exact hour
  // can never be guessed, on any date -- this is always not_evaluable,
  // never a guessed current/upcoming/past bucketed off the calendar date
  // alone.
  if (resolution.status !== "resolved") return "not_evaluable";

  const nowMinute = resolveNowMinuteOnEventTimeline(event.date, now);
  if (nowMinute === null) return now.date < event.date ? "upcoming" : "past";
  if (nowMinute < resolution.interval.startMinute) return "upcoming";
  if (nowMinute < resolution.interval.endMinute) return "current";
  return "past";
}

/**
 * Places `now` onto the event's own minute timeline (minute 0 = midnight of
 * `eventDate`) -- the only way an overnight shift can be compared without
 * ever touching Date/UTC. Returns null when `now` is more than one calendar
 * day away from `eventDate` in either direction, which is structurally
 * impossible for any interval this domain can produce (max 31.5h): the
 * caller falls back to plain calendar-date ordering in that case.
 */
function resolveNowMinuteOnEventTimeline(eventDate: string, now: LocalNow): number | null {
  if (eventDate === now.date) return now.minuteOfDay;
  if (isNextCalendarDay(eventDate, now.date)) return now.minuteOfDay + MINUTES_PER_DAY;
  return null;
}

/**
 * Whether `event` still deserves to appear in a present/future personal
 * view as of `now`.
 *
 * Handles two edge cases symmetrically, both purely from resolved shift
 * timing (never a guess): a night shift dated yesterday that's still
 * running past midnight stays relevant even though `Event.date` itself is
 * already in the past; and a day shift dated today that has already
 * finished stops being relevant even though `Event.date` is still today.
 * Duties and unresolved-timing shifts never carry forward from a past
 * date -- they have no hours to still be "running" -- but a same-day or
 * future Event whose exact hour can't be resolved stays relevant rather
 * than being dropped for lack of a guessed time.
 */
export function isEventStillRelevant(event: Event, schedule: ShiftSchedule, now: LocalNow): boolean {
  if (event.date < now.date) {
    if (event.category !== "shift") return false;
    if (!isNextCalendarDay(event.date, now.date)) return false;
    return classifyShiftTemporalState(event, schedule, now) === "current";
  }

  if (event.category !== "shift") return true;
  return classifyShiftTemporalState(event, schedule, now) !== "past";
}
