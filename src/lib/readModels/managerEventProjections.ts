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
 * A GENERIC role assignment -- `period: "unspecified"` (e.g. a weekend
 * schedule cell that just says `אחמ"ש`, with no יום/לילה split) -- is, by
 * domain rule, that person's supervisor (or technician) coverage for the
 * WHOLE date: both the day AND the night canonical window, never merely
 * one or the other, and never converted/normalized into a day- or
 * night-specific Event.
 *
 * Two DIFFERENT things follow from that, and this module deliberately
 * keeps them apart:
 *  1. COVERAGE (`roleCoverage`/`coverageStatus`) -- a generic Event is fed
 *     into BOTH the "day" and "night" `analyzeUnitShiftCoverage` call's
 *     input group, so `analyzeRoleCoverage` (`lib/domain/shiftCoverage.ts`)
 *     can correctly resolve it as covering each period's entire canonical
 *     window. See `coverageGroupFor` below.
 *  2. ROSTER/DISPLAY (`technicians`/`supervisors`/shadow lists) -- the
 *     SAME Event is never added to both the "day" and "night" entry's own
 *     people lists. Doing so would make a single generic assignment LOOK
 *     like two independent shift assignments to any consumer (Manager
 *     Coverage, the calendar, the selected-day panel) that renders a
 *     period's `supervisors` as "who is actually assigned this shift".
 *     Its one true roster home is its own native `${date}|unspecified`
 *     entry (still produced by the native per-key grouping below,
 *     unchanged) -- callers that want to surface "who's covering
 *     generically today" read THAT entry once per date, never per period.
 *
 * Deliberately INCLUDES a shadow generic assignment (`- צל` with no
 * period) in its native "unspecified" entry too -- shadow context (who's
 * shadowing today) belongs there exactly like every other shadow Event;
 * `analyzeRoleCoverage` filters `!event.shadow` before computing coverage,
 * so a shadow generic Event still never counts toward the coverage verdict
 * even though it's included in the coverage-input group.
 */
function isGenericCoverageEvent(event: Event): boolean {
  return event.period === "unspecified" && event.role !== null;
}

/**
 * The `Event[]` to feed `analyzeUnitShiftCoverage` for one date+period
 * entry -- the native roster group PLUS (for "day"/"night" only) every
 * generic role Event for that date, so the coverage verdict correctly
 * accounts for a generic assignment without that Event ever joining the
 * period's own ROSTER (`rosterEvents`, used for `technicians`/
 * `supervisors`/shadow lists -- see `isGenericCoverageEvent` above).
 */
function coverageGroupFor(
  period: Event["period"],
  rosterEvents: readonly Event[],
  genericEventsByDate: ReadonlyMap<string, Event[]>,
  date: string,
): readonly Event[] {
  if (period !== "day" && period !== "night") return rosterEvents;
  const generic = genericEventsByDate.get(date);
  if (!generic || generic.length === 0) return rosterEvents;
  return [...rosterEvents, ...generic];
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
 * yet). A date whose only shift Event is a generic (period-unspecified)
 * role assignment is the one exception: it DOES get real "day"/"night"
 * entries (their `roleCoverage`/`coverageStatus` reflect the generic
 * assignment covering both), plus its own native "unspecified" entry
 * (where that assignment's actual roster/name lives) -- see
 * `isGenericCoverageEvent` above for why those are two separate concerns.
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

  const genericEventsByDate = new Map<string, Event[]>();
  for (const event of shiftEvents) {
    if (!isGenericCoverageEvent(event)) continue;
    const bucket = genericEventsByDate.get(event.date);
    if (bucket) bucket.push(event);
    else genericEventsByDate.set(event.date, [event]);
  }

  const entryKeys = new Set(groups.keys());
  for (const date of genericEventsByDate.keys()) {
    entryKeys.add(`${date}|day`);
    entryKeys.add(`${date}|night`);
  }

  const entries: ManagerShiftOverviewEntry[] = [];

  for (const key of entryKeys) {
    const [date, period] = key.split("|") as [string, Event["period"]];
    const rosterEvents = groups.get(key) ?? [];
    const sortedRoster = [...rosterEvents].sort(compareEventsStable);

    const technicians = sortedRoster.filter((e) => e.role === "technician" && !e.shadow).map(toShiftGroupPerson);
    const supervisors = sortedRoster.filter((e) => e.role === "supervisor" && !e.shadow).map(toShiftGroupPerson);
    const shadowTechnicians = sortedRoster.filter((e) => e.role === "technician" && e.shadow).map(toShiftGroupPerson);
    const shadowSupervisors = sortedRoster.filter((e) => e.role === "supervisor" && e.shadow).map(toShiftGroupPerson);

    const coverageEvents = coverageGroupFor(period, rosterEvents, genericEventsByDate, date);
    const analysis = analyzeUnitShiftCoverage(period, coverageEvents, shiftSchedule);

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
