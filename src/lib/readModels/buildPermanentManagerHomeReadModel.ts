import { computeIntervalTiming, type AssignmentTiming } from "@/lib/domain/assignmentTiming";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import { analyzeUnitShiftCoverage } from "@/lib/domain/shiftCoverage";
import {
  nextShiftPeriod,
  previousShiftPeriod,
  resolveCurrentShiftPeriod,
  type AdjacentShiftPeriod,
  type MinuteInterval,
  type ShiftSchedule,
} from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { toPersonalProfile } from "./buildPersonalScheduleReadModel";
import { buildManagerAbsenceEntries, buildManagerDutyEntries, buildShiftStaffingOverview } from "./managerEventProjections";
import type { ManagerShiftOverviewEntry } from "./managerTypes";
import type {
  PermanentManagerHomeAbsence,
  PermanentManagerHomeCurrentShift,
  PermanentManagerHomeDuty,
  PermanentManagerHomeReadModel,
  PermanentManagerHomeShift,
} from "./permanentManagerHomeTypes";

export interface BuildPermanentManagerHomeReadModelInput {
  /** The authenticated permanent-manager Person this read model is being built for. */
  person: Person;
  /** Full parsed personnel list -- needed only to resolve duty/absence person names. */
  people: readonly Person[];
  /** Full server-side parsed Event set (every person). */
  events: readonly Event[];
  shiftSchedule: ShiftSchedule;
  fetchedAt: string;
  now: LocalNow;
}

/** `schedule.dayStartMinute`/`dayEndMinute` or `nightStartMinute`/`nightEndMinute` -- the same two-field mapping `resolveEventShiftInterval` already inlines, packaged here so it's computed once per shift instead of three times. */
function canonicalInterval(period: "day" | "night", schedule: ShiftSchedule): MinuteInterval {
  return period === "day"
    ? { startMinute: schedule.dayStartMinute, endMinute: schedule.dayEndMinute }
    : { startMinute: schedule.nightStartMinute, endMinute: schedule.nightEndMinute };
}

/**
 * The unit-wide staffing+coverage entry for one canonical shift, whether or
 * not `buildShiftStaffingOverview` produced one. That helper deliberately
 * omits an entry for a date+period with ZERO shift Events at all (its own
 * "not yet scheduled" convention, safe for an arbitrary future date range).
 * For the department's own previous/current/next shift, "zero Events" is a
 * genuinely meaningful "nobody is staffed on this shift" fact, not merely
 * unscheduled -- so this falls back to calling `analyzeUnitShiftCoverage`
 * directly with an empty group, the exact same coverage engine call
 * `buildShiftStaffingOverview` itself makes internally.
 */
function resolveShiftOverviewEntry(
  ref: AdjacentShiftPeriod,
  overviewByKey: ReadonlyMap<string, ManagerShiftOverviewEntry>,
  schedule: ShiftSchedule,
): ManagerShiftOverviewEntry {
  const existing = overviewByKey.get(`${ref.date}|${ref.period}`);
  if (existing) return existing;

  const analysis = analyzeUnitShiftCoverage(ref.period, [], schedule);
  return {
    date: ref.date,
    period: ref.period,
    technicians: [],
    supervisors: [],
    shadowTechnicians: [],
    shadowSupervisors: [],
    coverageStatus: analysis.coverageStatus,
    missingIntervals: analysis.missingIntervals,
    roleCoverage: analysis.roleCoverage,
  };
}

function toShift(
  ref: AdjacentShiftPeriod,
  entry: ManagerShiftOverviewEntry,
  timing: Extract<AssignmentTiming, { status: "resolved" }>,
): PermanentManagerHomeShift {
  return {
    date: ref.date,
    period: ref.period,
    startLocalTime: timing.startLocalTime,
    endLocalTime: timing.endLocalTime,
    supervisors: entry.supervisors,
    technicians: entry.technicians,
    coverageStatus: entry.coverageStatus,
    missingIntervals: entry.missingIntervals,
    roleCoverage: entry.roleCoverage,
  };
}

function toDutyView(duty: { personId: string; personName: string; dutyFamily: NonNullable<Event["dutyFamily"]>; slot: number | null }): PermanentManagerHomeDuty {
  return { personId: duty.personId, personName: duty.personName, dutyFamily: duty.dutyFamily, slot: duty.slot };
}

function toAbsenceView(absence: { personId: string; personName: string; absenceKind: NonNullable<Event["absenceKind"]> }): PermanentManagerHomeAbsence {
  return { personId: absence.personId, personName: absence.personName, absenceKind: absence.absenceKind };
}

/**
 * Pure, deterministic construction of `PermanentManagerHomeReadModel` from
 * already-parsed domain data -- no network, no auth, no Date/UTC. Mirrors
 * `buildPersonalScheduleReadModel`'s conventions (explicit `now`, never
 * mutates input, every array deterministically ordered by the domain
 * functions it reuses).
 */
export function buildPermanentManagerHomeReadModel(
  input: BuildPermanentManagerHomeReadModelInput,
): PermanentManagerHomeReadModel {
  const { person, people, events, shiftSchedule, fetchedAt, now } = input;

  const currentRef = resolveCurrentShiftPeriod(now, shiftSchedule);
  // Always non-null: resolveCurrentShiftPeriod only ever returns "day"/"night", which always has a canonical adjacency.
  const previousRef = previousShiftPeriod(currentRef.date, currentRef.period) as AdjacentShiftPeriod;
  const nextRef = nextShiftPeriod(currentRef.date, currentRef.period) as AdjacentShiftPeriod;

  const dates = new Set([previousRef.date, currentRef.date, nextRef.date]);
  const overviewByKey = new Map(
    buildShiftStaffingOverview(events, shiftSchedule, dates).map((entry) => [`${entry.date}|${entry.period}`, entry]),
  );

  const previousEntry = resolveShiftOverviewEntry(previousRef, overviewByKey, shiftSchedule);
  const currentEntry = resolveShiftOverviewEntry(currentRef, overviewByKey, shiftSchedule);
  const nextEntry = resolveShiftOverviewEntry(nextRef, overviewByKey, shiftSchedule);

  const previousTiming = computeIntervalTiming(canonicalInterval(previousRef.period, shiftSchedule), previousRef.date, now);
  const currentTiming = computeIntervalTiming(canonicalInterval(currentRef.period, shiftSchedule), currentRef.date, now);
  const nextTiming = computeIntervalTiming(canonicalInterval(nextRef.period, shiftSchedule), nextRef.date, now);

  // computeIntervalTiming always resolves for a canonical (never overridden) interval -- start < end is guaranteed by buildShiftSchedule.
  if (previousTiming.status !== "resolved" || currentTiming.status !== "resolved" || nextTiming.status !== "resolved") {
    throw new Error("Unexpected unresolved canonical shift timing.");
  }

  const currentShift: PermanentManagerHomeCurrentShift = {
    ...toShift(currentRef, currentEntry, currentTiming),
    timing: currentTiming,
  };

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const todayDates = new Set([now.date]);
  const todayDuties = buildManagerDutyEntries(events, peopleById, todayDates).map(toDutyView);
  const todayAbsences = buildManagerAbsenceEntries(events, peopleById, todayDates).map(toAbsenceView);

  return {
    person: toPersonalProfile(person),
    fetchedAt,
    localNow: now,
    previousShift: toShift(previousRef, previousEntry, previousTiming),
    currentShift,
    nextShift: toShift(nextRef, nextEntry, nextTiming),
    todayDuties,
    todayAbsences,
  };
}
