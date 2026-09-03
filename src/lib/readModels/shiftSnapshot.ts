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
import { buildShiftStaffingOverview } from "./managerEventProjections";
import type { ManagerShiftGroupPerson, ManagerShiftOverviewEntry } from "./managerTypes";
import type { PermanentManagerHomeCurrentShift, PermanentManagerHomeShift } from "./permanentManagerHomeTypes";

/**
 * The department-wide previous/current/next shift, resolved from `now`
 * against the canonical day/night timeline -- entirely independent of any
 * one person's own assignments (see `resolveShiftSnapshotTriad`'s own
 * docstring). Reuses `PermanentManagerHomeShift`/`PermanentManagerHomeCurrentShift`
 * (defined in `permanentManagerHomeTypes.ts`) rather than a second,
 * parallel shape -- both consumers of this triad (the permanent-manager
 * Home and the Manager Area's own shift-working-manager section) need the
 * identical safe projection, and giving it a second name/file would only
 * suggest a difference that doesn't exist.
 */
export interface ShiftSnapshotTriad {
  previousShift: PermanentManagerHomeShift;
  currentShift: PermanentManagerHomeCurrentShift;
  nextShift: PermanentManagerHomeShift;
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
 * For a previous/current/next shift, "zero Events" is a genuinely
 * meaningful "nobody is staffed on this shift" fact, not merely
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

/**
 * Whoever holds a GENERIC (period-unspecified) role assignment for
 * `entry`'s date -- e.g. a weekend cell that just says `אחמ"ש` -- read
 * from that date's own native `${date}|unspecified` entry (`genericEntry`,
 * already produced by `buildShiftStaffingOverview` and already looked up
 * in `overviewByKey` exactly like every other entry -- no separate
 * interpretation of "generic" here), MINUS anyone already present in
 * `entry`'s own native roster for this exact period (so nobody who
 * already has an explicit period-specific assignment is ever listed
 * twice on the same card).
 *
 * Deliberately kept OUT of `entry.supervisors`/`technicians` -- i.e.
 * never merged into the plain roster -- and returned as its own list
 * instead (see `PermanentManagerHomeShift.genericSupervisors`/
 * `genericTechnicians`'s own doc comment for why): the previous/current/
 * next triad can legitimately put the SAME date's day shift and night
 * shift on two adjacent cards (e.g. current=day, next=night of the same
 * date), and a generic assignment covers both -- so the same person can
 * appear on both cards. Presenting that as an ordinary, unlabeled
 * `supervisors`/`technicians` entry on each would look like two
 * independent assignments rather than the one shared/generic assignment
 * it actually is; `ShiftSnapshotCard` renders this list under its own
 * distinct "(כל היום)" label so it's never confused with a real
 * period-specific roster member.
 */
function genericRosterFor(
  entryPeople: readonly ManagerShiftGroupPerson[],
  genericPeople: readonly ManagerShiftGroupPerson[] | undefined,
): ManagerShiftGroupPerson[] {
  if (!genericPeople || genericPeople.length === 0) return [];
  const existingIds = new Set(entryPeople.map((person) => person.personId));
  return genericPeople.filter((person) => !existingIds.has(person.personId));
}

function toShift(
  ref: AdjacentShiftPeriod,
  entry: ManagerShiftOverviewEntry,
  genericEntry: ManagerShiftOverviewEntry | undefined,
  timing: Extract<AssignmentTiming, { status: "resolved" }>,
): PermanentManagerHomeShift {
  return {
    date: ref.date,
    period: ref.period,
    startLocalTime: timing.startLocalTime,
    endLocalTime: timing.endLocalTime,
    supervisors: entry.supervisors,
    technicians: entry.technicians,
    genericSupervisors: genericRosterFor(entry.supervisors, genericEntry?.supervisors),
    genericTechnicians: genericRosterFor(entry.technicians, genericEntry?.technicians),
    coverageStatus: entry.coverageStatus,
    missingIntervals: entry.missingIntervals,
    roleCoverage: entry.roleCoverage,
  };
}

/**
 * Resolves the department-wide previous/current/next shift as of `now` --
 * shared by the permanent-manager Home (`buildPermanentManagerHomeReadModel.ts`)
 * and the Manager Area's own shift-snapshot section
 * (`buildManagerOverviewReadModel.ts`), extracted here so neither
 * reimplements previous/current/next resolution, roster/coverage lookup,
 * or progress timing.
 *
 * Deliberately NOT anchored to any one person's own assignments --
 * `resolveCurrentShiftPeriod` resolves purely from the canonical day/night
 * timeline and `now`, and `buildShiftStaffingOverview` reports whoever is
 * ACTUALLY staffed on each of the three resulting shifts, regardless of
 * who is asking. "Current" always resolves to a real canonical window: the
 * day/night cycle is exactly back-to-back 12h blocks with no gaps (see
 * `resolveCurrentShiftPeriod`'s own docstring), so there is no "no active
 * shift right now" state to handle here -- only whether anyone is STAFFED
 * on it, which `coverageStatus`/`roleCoverage` already answer honestly
 * (including a genuinely empty shift, never inventing a placeholder
 * assignee). `currentShift.timing` is typed as always-resolved
 * (`Extract<AssignmentTiming, { status: "resolved" }>`) for exactly this
 * reason -- callers never need to guard against an unresolved progress
 * bar for the current shift.
 *
 * Correctly crosses midnight for an overnight (night-period) shift: every
 * date/time computation goes through `previousShiftPeriod`/
 * `nextShiftPeriod`/`resolveEventShiftInterval`'s own canonical-window
 * math (`lib/domain/shiftSchedule.ts`), never a second, ad hoc date
 * calculation.
 */
export function resolveShiftSnapshotTriad(
  events: readonly Event[],
  shiftSchedule: ShiftSchedule,
  now: LocalNow,
): ShiftSnapshotTriad {
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

  const previousGeneric = overviewByKey.get(`${previousRef.date}|unspecified`);
  const currentGeneric = overviewByKey.get(`${currentRef.date}|unspecified`);
  const nextGeneric = overviewByKey.get(`${nextRef.date}|unspecified`);

  const previousTiming = computeIntervalTiming(canonicalInterval(previousRef.period, shiftSchedule), previousRef.date, now);
  const currentTiming = computeIntervalTiming(canonicalInterval(currentRef.period, shiftSchedule), currentRef.date, now);
  const nextTiming = computeIntervalTiming(canonicalInterval(nextRef.period, shiftSchedule), nextRef.date, now);

  // computeIntervalTiming always resolves for a canonical (never overridden) interval -- start < end is guaranteed by buildShiftSchedule.
  if (previousTiming.status !== "resolved" || currentTiming.status !== "resolved" || nextTiming.status !== "resolved") {
    throw new Error("Unexpected unresolved canonical shift timing.");
  }

  const currentShift: PermanentManagerHomeCurrentShift = {
    ...toShift(currentRef, currentEntry, currentGeneric, currentTiming),
    timing: currentTiming,
  };

  return {
    previousShift: toShift(previousRef, previousEntry, previousGeneric, previousTiming),
    currentShift,
    nextShift: toShift(nextRef, nextEntry, nextGeneric, nextTiming),
  };
}
