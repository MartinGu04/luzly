import type { Event } from "@/lib/domain/event";
import { analyzeUnitShiftCoverage } from "@/lib/domain/shiftCoverage";
import type { ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import type {
  ManagerAbsenceEntry,
  ManagerDutyEntry,
  ManagerShiftGroupPerson,
  ManagerShiftOverviewEntry,
} from "./managerTypes";

/**
 * Shared unit-wide projections from a manager-authorized `Event[]` snapshot
 * onto a given set of dates -- extracted from `buildManagerOverviewReadModel`
 * (PR #14) so both Manager Overview (an arbitrary `ManagerDateRange`) and the
 * Schedule "everyone" perspective (PR #24, always the displayed calendar
 * month) reuse the EXACT same staffing/coverage/duty/absence semantics
 * instead of two independently-maintained (and potentially drifting) copies.
 * Every function here is pure -- no network, no auth, no Date/UTC.
 */

const PERIOD_ORDER: Record<string, number> = { day: 0, night: 1, morning: 2, unspecified: 3 };

/** Deterministic ordering for the displayed people lists within a group -- personId first, then sourceSheet/sourceCell (never exposed on the output type). Coverage itself (`analyzeUnitShiftCoverage`) doesn't depend on this order at all. */
function compareEventsStable(a: Event, b: Event): number {
  if (a.personId !== b.personId) return a.personId < b.personId ? -1 : 1;
  if (a.sourceSheet !== b.sourceSheet) return a.sourceSheet < b.sourceSheet ? -1 : 1;
  return a.sourceCell < b.sourceCell ? -1 : a.sourceCell > b.sourceCell ? 1 : 0;
}

function toShiftGroupPerson(event: Event): ManagerShiftGroupPerson {
  return {
    personId: event.personId,
    personName: event.personName,
    certainty: event.certainty,
    startTimeOverride: event.startTimeOverride,
    endTimeOverride: event.endTimeOverride,
  };
}

/**
 * Groups every shift Event within `dates` by date+period, preserving EVERY
 * assigned person (never collapsed to one). `coverageStatus`/
 * `missingIntervals` reuse `analyzeUnitShiftCoverage` -- a PURE,
 * person-order-independent group coverage algorithm (see
 * `lib/domain/shiftCoverage.ts`) that evaluates the canonical shift window
 * against both roles' merged intervals. This deliberately does NOT pick an
 * arbitrary "target" person the way `analyzeShiftCounterparts` does -- the
 * result is identical regardless of `personId`/`sourceCell` ordering.
 *
 * Only produces an entry for a date+period that has at least one shift
 * Event -- a date+period with zero shift Events at all produces no entry,
 * same convention `ManagerCoverageSection` already relies on (never a
 * fabricated "missing" verdict for a date that simply has no shift data
 * yet).
 */
export function buildShiftStaffingOverview(
  events: readonly Event[],
  shiftSchedule: ShiftSchedule,
  dates: ReadonlySet<string>,
): ManagerShiftOverviewEntry[] {
  const shiftEvents = events.filter((event) => event.category === "shift" && dates.has(event.date));

  const groups = new Map<string, Event[]>();
  for (const event of shiftEvents) {
    const key = `${event.date}|${event.period}`;
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }

  const entries: ManagerShiftOverviewEntry[] = [];

  for (const [key, groupEvents] of groups) {
    const [date, period] = key.split("|") as [string, Event["period"]];
    const sortedGroup = [...groupEvents].sort(compareEventsStable);

    const technicians = sortedGroup.filter((e) => e.role === "technician" && !e.shadow).map(toShiftGroupPerson);
    const supervisors = sortedGroup.filter((e) => e.role === "supervisor" && !e.shadow).map(toShiftGroupPerson);
    const shadowTechnicians = sortedGroup.filter((e) => e.role === "technician" && e.shadow).map(toShiftGroupPerson);
    const shadowSupervisors = sortedGroup.filter((e) => e.role === "supervisor" && e.shadow).map(toShiftGroupPerson);

    const analysis = analyzeUnitShiftCoverage(period, sortedGroup, shiftSchedule);

    entries.push({
      date,
      period,
      technicians,
      supervisors,
      shadowTechnicians,
      shadowSupervisors,
      coverageStatus: analysis.coverageStatus,
      missingIntervals: analysis.missingIntervals,
      roleCoverage: analysis.roleCoverage,
    });
  }

  return entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
  });
}

function toManagerDutyEntry(event: Event, peopleById: ReadonlyMap<string, Person>): ManagerDutyEntry {
  return {
    personId: event.personId,
    personName: peopleById.get(event.personId)?.name ?? event.personName,
    date: event.date,
    dutyFamily: event.dutyFamily as NonNullable<Event["dutyFamily"]>,
    slot: event.slot,
    certainty: event.certainty,
  };
}

function compareDutyEntries(a: ManagerDutyEntry, b: ManagerDutyEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.personId !== b.personId) return a.personId < b.personId ? -1 : 1;
  if (a.dutyFamily !== b.dutyFamily) return a.dutyFamily < b.dutyFamily ? -1 : 1;
  return (a.slot ?? -1) - (b.slot ?? -1);
}

/** Every typed duty Event within `dates`, deterministically ordered. */
export function buildManagerDutyEntries(
  events: readonly Event[],
  peopleById: ReadonlyMap<string, Person>,
  dates: ReadonlySet<string>,
): ManagerDutyEntry[] {
  return events
    .filter((event) => event.category === "duty" && event.dutyFamily !== null && dates.has(event.date))
    .map((event) => toManagerDutyEntry(event, peopleById))
    .sort(compareDutyEntries);
}

function toManagerAbsenceEntry(event: Event, peopleById: ReadonlyMap<string, Person>): ManagerAbsenceEntry {
  return {
    personId: event.personId,
    personName: peopleById.get(event.personId)?.name ?? event.personName,
    date: event.date,
    absenceKind: event.absenceKind as NonNullable<Event["absenceKind"]>,
    certainty: event.certainty,
  };
}

function compareAbsenceEntries(a: ManagerAbsenceEntry, b: ManagerAbsenceEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0;
}

/** Every typed absence Event within `dates`, deterministically ordered. */
export function buildManagerAbsenceEntries(
  events: readonly Event[],
  peopleById: ReadonlyMap<string, Person>,
  dates: ReadonlySet<string>,
): ManagerAbsenceEntry[] {
  return events
    .filter((event) => event.category === "absence" && event.absenceKind !== null && dates.has(event.date))
    .map((event) => toManagerAbsenceEntry(event, peopleById))
    .sort(compareAbsenceEntries);
}
