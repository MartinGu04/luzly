import { groupEmergencyAssignmentsIntoShifts, type EmergencyAssignment, type EmergencyShift } from "@/lib/domain/emergencyShift";
import type { LocalNow } from "@/lib/domain/localNow";
import { nextShiftPeriod, previousShiftPeriod, resolveCurrentShiftPeriod, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { toEveryoneShiftEntry } from "./buildEmergencyScheduleReadModel";
import type { EmergencyEveryoneShiftEntry } from "./emergencyScheduleTypes";

/**
 * The Manager Area's Emergency Mode operational overview -- "משמרת קודמת |
 * משמרת נוכחית | משמרת הבאה" (spec: manager overview should be operational
 * and immediate, not a chronological dump). Each slot is `null` exactly
 * when nothing was recorded for that specific date+period in the
 * emergency workbook -- a real, expected state (e.g. right at the very
 * start of an emergency period, `previous` has nothing to point to; or a
 * slot the workbook simply never got assignments for), never a crash and
 * never a fabricated placeholder shift.
 */
export interface EmergencyManagerOperationalOverview {
  previous: EmergencyEveryoneShiftEntry | null;
  current: EmergencyEveryoneShiftEntry | null;
  next: EmergencyEveryoneShiftEntry | null;
}

function findShift(shifts: readonly EmergencyShift[], date: string, period: "day" | "night"): EmergencyShift | null {
  return shifts.find((shift) => shift.date === date && shift.period === period) ?? null;
}

/** The earliest recorded shift at or after `fromDate` -- used ONLY as the degraded fallback for `next` when `schedule` is unavailable (see this module's own docs), the same "chronological, no time-of-day precision needed" question `buildEmergencyPersonalHome.ts`'s own `findNextOwnShift` answers for a single person, generalized here to "anyone". */
function findEarliestShiftFrom(shifts: readonly EmergencyShift[], fromDate: string): EmergencyShift | null {
  return shifts.find((shift) => shift.date >= fromDate) ?? null;
}

/**
 * Resolves previous/current/next purely from POSITION on the canonical
 * day → night → day → ... timeline -- reuses the EXACT SAME primitives
 * `buildEmergencyPersonalHome.ts` already uses for "current"/"next"
 * (`resolveCurrentShiftPeriod`/`nextShiftPeriod`,
 * `lib/domain/shiftSchedule.ts`), extended with that same timeline's
 * `previousShiftPeriod` for the one direction the personal home never
 * needed. Never a second definition of shift timing, and never a "nearest
 * slot that happens to have data" search -- "previous"/"next" are always
 * the literal immediately-adjacent 12h block on the timeline, whether or
 * not anything was recorded for it (mirroring `resolveCurrentShiftPeriod`'s
 * own contract: exactly one canonical block always contains `now`,
 * independent of whether anyone is staffed on it).
 *
 * `schedule: null` (the regular workbook's own shift-time configuration
 * is broken) degrades exactly like `buildEmergencyPersonalHome`:
 * "current"/"previous" can't be pinned to an exact minute without a
 * schedule, so both become `null` rather than guessed, while `next`
 * still falls back to the earliest recorded shift from today -- a
 * chronological question that needs no time-of-day precision.
 */
export function resolveEmergencyManagerOverview(
  assignments: readonly EmergencyAssignment[],
  now: LocalNow,
  schedule: ShiftSchedule | null,
): EmergencyManagerOperationalOverview {
  const shifts = groupEmergencyAssignmentsIntoShifts(assignments);

  if (!schedule) {
    const next = findEarliestShiftFrom(shifts, now.date);
    return { previous: null, current: null, next: next ? toEveryoneShiftEntry(next) : null };
  }

  const currentPeriod = resolveCurrentShiftPeriod(now, schedule);
  const current = findShift(shifts, currentPeriod.date, currentPeriod.period);

  const prevPeriod = previousShiftPeriod(currentPeriod.date, currentPeriod.period);
  const previous = prevPeriod ? findShift(shifts, prevPeriod.date, prevPeriod.period) : null;

  const nextPeriod = nextShiftPeriod(currentPeriod.date, currentPeriod.period);
  const next = nextPeriod ? findShift(shifts, nextPeriod.date, nextPeriod.period) : null;

  return {
    previous: previous ? toEveryoneShiftEntry(previous) : null,
    current: current ? toEveryoneShiftEntry(current) : null,
    next: next ? toEveryoneShiftEntry(next) : null,
  };
}
