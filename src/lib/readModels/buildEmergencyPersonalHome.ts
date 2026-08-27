import { groupEmergencyAssignmentsIntoShifts, type EmergencyAssignment, type EmergencyShift } from "@/lib/domain/emergencyShift";
import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";
import { nextShiftPeriod, resolveCurrentShiftPeriod, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { LocalNow } from "@/lib/domain/localNow";
import type { EmergencyParseDiagnostic } from "@/lib/parsers/emergencySchedule";
import type {
  EmergencyPersonalHomeReadModel,
  EmergencyPersonalRosterEntry,
  EmergencyPersonalShiftView,
} from "./emergencyPersonalHomeTypes";

export interface BuildEmergencyPersonalHomeInput {
  period: EmergencyModePeriod;
  assignments: readonly EmergencyAssignment[];
  personId: string;
  now: LocalNow;
  /** Null when the regular workbook's shift-time configuration is broken -- degrades gracefully rather than blocking the emergency view (spec section 9 concerns Emergency Mode's OWN data source, not the regular settings sheet). */
  schedule: ShiftSchedule | null;
  fetchedAt: string;
  diagnostics: readonly EmergencyParseDiagnostic[];
}

const PERIOD_ORDER = { day: 0, night: 1 } as const;

/**
 * Builds the authenticated person's Emergency Mode personal home view
 * (spec section 9) -- pure, no I/O. While Emergency Mode is active, the
 * personal operational shift model comes EXCLUSIVELY from
 * `EmergencyAssignment`s, never regular shift Events, and never
 * generates Potential duty events (regular duty semantics do not apply
 * here at all).
 *
 * "Current" requires knowing WHERE in the day/night timeline `now`
 * falls, which needs a real `ShiftSchedule` -- when the regular
 * workbook's shift-time configuration is broken (`schedule: null`),
 * this never guesses which shift is "current" (that would risk
 * misrepresenting an inactive shift as live); it still honestly reports
 * the person's chronologically NEXT assignment by date, which needs no
 * time-of-day precision.
 */
export function buildEmergencyPersonalHome(input: BuildEmergencyPersonalHomeInput): EmergencyPersonalHomeReadModel {
  const shifts = groupEmergencyAssignmentsIntoShifts(input.assignments);

  if (!input.schedule) {
    const next = findNextOwnShift(shifts, input.personId, input.now.date, null);
    return {
      period: input.period,
      localNow: input.now,
      fetchedAt: input.fetchedAt,
      current: null,
      next: next ? toShiftView(next, input.personId, null) : null,
      diagnostics: [...input.diagnostics],
    };
  }

  const currentPeriod = resolveCurrentShiftPeriod(input.now, input.schedule);
  const currentShift = shifts.find((s) => s.date === currentPeriod.date && s.period === currentPeriod.period);
  const currentHasSelf = currentShift?.assignments.some((a) => a.personId === input.personId) ?? false;

  const searchFrom = nextShiftPeriod(currentPeriod.date, currentPeriod.period) ?? currentPeriod;
  const next = findNextOwnShift(shifts, input.personId, searchFrom.date, searchFrom.period);

  return {
    period: input.period,
    localNow: input.now,
    fetchedAt: input.fetchedAt,
    current: currentHasSelf && currentShift ? toShiftView(currentShift, input.personId, input.schedule) : null,
    next: next ? toShiftView(next, input.personId, input.schedule) : null,
    diagnostics: [...input.diagnostics],
  };
}

/** The earliest shift (date+period ascending) at or after `fromDate`(+`fromPeriod`) in which `personId` actually has an assignment. */
function findNextOwnShift(
  shifts: readonly EmergencyShift[],
  personId: string,
  fromDate: string,
  fromPeriod: "day" | "night" | null,
): EmergencyShift | null {
  for (const shift of shifts) {
    if (shift.date < fromDate) continue;
    if (shift.date === fromDate && fromPeriod !== null && PERIOD_ORDER[shift.period] < PERIOD_ORDER[fromPeriod]) continue;
    if (shift.assignments.some((a) => a.personId === personId)) return shift;
  }
  return null;
}

function toShiftView(
  shift: EmergencyShift,
  personId: string,
  schedule: ShiftSchedule | null,
): EmergencyPersonalShiftView {
  const ownDesks = shift.assignments.filter((a) => a.personId === personId).map((a) => a.desk);
  const roster: EmergencyPersonalRosterEntry[] = shift.assignments
    .filter((a) => a.personId !== personId)
    .map((a) => ({ personId: a.personId, personName: a.personName, desk: a.desk }));

  const { startMinute, endMinute } = schedule
    ? shift.period === "day"
      ? { startMinute: schedule.dayStartMinute, endMinute: schedule.dayEndMinute }
      : { startMinute: schedule.nightStartMinute, endMinute: schedule.nightEndMinute }
    : { startMinute: null, endMinute: null };

  return { date: shift.date, period: shift.period, ownDesks, startMinute, endMinute, roster };
}
