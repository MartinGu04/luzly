import type { ManagerDateRange } from "@/lib/domain/dateRange";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import {
  detectOperationalIssues,
  type IssueSeverity,
  type OperationalIssue,
} from "@/lib/domain/operationalIssues";
import type { PotentialAllocation } from "@/lib/domain/potentialAllocation";
import {
  reconcilePotentialAllocations,
  type ManagerRequirementReconciliation,
} from "@/lib/domain/potentialReconciliation";
import { analyzeUnitShiftCoverage } from "@/lib/domain/shiftCoverage";
import type { ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { buildPersonalScheduleReadModel } from "./buildPersonalScheduleReadModel";
import type {
  ManagerAbsenceEntry,
  ManagerDutyEntry,
  ManagerIssue,
  ManagerOverviewReadModel,
  ManagerPersonSummary,
  ManagerPotentialRequirementView,
  ManagerShiftGroupPerson,
  ManagerShiftOverviewEntry,
} from "./managerTypes";
import type { PersonalIssueTargetSummary } from "./types";

export interface BuildManagerOverviewReadModelInput {
  /** The authenticated manager -- already verified `isManager === true` by the caller (see `managerOverview.ts`). */
  manager: Person;
  /** Full parsed personnel list -- everyone visible to the manager. */
  people: readonly Person[];
  /** Full parsed internal Event[] (every person). */
  events: readonly Event[];
  /** Combined H1 + H2 Potential allocations, structurally parsed, never fuzzy-matched. */
  potentialAllocations: readonly PotentialAllocation[];
  shiftSchedule: ShiftSchedule;
  fetchedAt: string;
  now: LocalNow;
  range: ManagerDateRange;
  /** Raw, unvalidated -- null means "everyone"; validated against `people` below. */
  selectedPersonId: string | null;
  problemsOnly: boolean;
}

/**
 * Pure, deterministic construction of `ManagerOverviewReadModel` from
 * already-parsed domain data -- no network, no auth, no Date/UTC, mirrors
 * `buildPersonalScheduleReadModel`'s purity contract. Never mutates any
 * input array. The selected-person section reuses
 * `buildPersonalScheduleReadModel` outright (see `README.md`) rather than
 * reimplementing any personal domain logic.
 */
export function buildManagerOverviewReadModel(
  input: BuildManagerOverviewReadModelInput,
): ManagerOverviewReadModel {
  const {
    manager,
    people,
    events,
    potentialAllocations,
    shiftSchedule,
    fetchedAt,
    now,
    range,
    selectedPersonId,
    problemsOnly,
  } = input;

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const rangeDates = new Set(range.dates);

  const roster = [...people].map(toManagerPersonSummary).sort(compareRosterEntries);

  const resolvedSelectedPerson =
    selectedPersonId !== null ? (peopleById.get(selectedPersonId) ?? null) : null;

  const issues = detectOperationalIssues(events, people, shiftSchedule)
    .filter((issue) => rangeDates.has(issue.date))
    .sort(compareManagerIssues)
    .map((issue) => toManagerIssue(issue, peopleById));

  const coverageOverview = buildCoverageOverview(events, shiftSchedule, rangeDates);

  const duties = events
    .filter((event) => event.category === "duty" && event.dutyFamily !== null && rangeDates.has(event.date))
    .map((event) => toManagerDutyEntry(event, peopleById))
    .sort(compareDutyEntries);

  const absences = events
    .filter((event) => event.category === "absence" && event.absenceKind !== null && rangeDates.has(event.date))
    .map((event) => toManagerAbsenceEntry(event, peopleById))
    .sort(compareAbsenceEntries);

  const potentialRequirements: ManagerPotentialRequirementView[] = reconcilePotentialAllocations(
    potentialAllocations.filter((allocation) => rangeDates.has(allocation.date)),
    events,
  ).map((reconciliation) => toManagerPotentialRequirementView(reconciliation, peopleById));

  const selectedPerson = resolvedSelectedPerson
    ? buildPersonalScheduleReadModel({ person: resolvedSelectedPerson, people, events, shiftSchedule, fetchedAt, now })
    : null;

  const selectedPersonRangeAbsences = resolvedSelectedPerson
    ? absences.filter((entry) => entry.personId === resolvedSelectedPerson.id)
    : [];

  return {
    manager: { id: manager.id, name: manager.name },
    fetchedAt,
    localNow: now,
    range: { key: range.key, startDate: range.startDate, endDate: range.endDate, month: range.month },
    problemsOnly,
    roster,
    selectedPersonId: resolvedSelectedPerson?.id ?? null,
    issues,
    coverageOverview,
    duties,
    absences,
    potentialRequirements,
    selectedPerson,
    selectedPersonRangeAbsences,
  };
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

function toManagerPersonSummary(person: Person): ManagerPersonSummary {
  return {
    id: person.id,
    name: person.name,
    isManager: person.isManager,
    isTechnician: person.isTechnician,
    isSupervisor: person.isSupervisor,
    personnelType: person.personnelType,
  };
}

/** By name, then id as a stable tiebreak -- duplicate names stay a safe, deterministic order (the URL always selects by id, never by name). */
function compareRosterEntries(a: ManagerPersonSummary, b: ManagerPersonSummary): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Global operational issues
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<IssueSeverity, number> = { critical: 0, review: 1, info: 2 };

function compareManagerIssues(a: OperationalIssue, b: OperationalIssue): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (SEVERITY_ORDER[a.severity] !== SEVERITY_ORDER[b.severity]) {
    return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  }
  if (a.personId !== b.personId) return a.personId < b.personId ? -1 : 1;
  if (a.reason !== b.reason) return a.reason < b.reason ? -1 : 1;
  const keyA = issueEvidenceSortKey(a);
  const keyB = issueEvidenceSortKey(b);
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

/** Internal-only sort key (sourceSheet/sourceCell never leave this file). */
function issueEvidenceSortKey(issue: OperationalIssue): string {
  if (issue.targetEvent) return `${issue.targetEvent.sourceSheet}!${issue.targetEvent.sourceCell}`;
  return issue.events.map((event) => `${event.sourceSheet}!${event.sourceCell}`).join(",");
}

function toIssueTargetSummary(event: Event): PersonalIssueTargetSummary {
  return { date: event.date, category: event.category, title: event.title, role: event.role, period: event.period };
}

function toManagerIssue(issue: OperationalIssue, peopleById: ReadonlyMap<string, Person>): ManagerIssue {
  return {
    personId: issue.personId,
    personName: peopleById.get(issue.personId)?.name ?? "",
    reason: issue.reason,
    severity: issue.severity,
    date: issue.date,
    missingIntervals: issue.missingIntervals,
    metadata: issue.metadata,
    targetEvent: issue.targetEvent ? toIssueTargetSummary(issue.targetEvent) : null,
  };
}

// ---------------------------------------------------------------------------
// Unit-wide shift coverage overview
// ---------------------------------------------------------------------------

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
 * Groups every shift Event within `rangeDates` by date+period, preserving
 * EVERY assigned person (never collapsed to one). `coverageStatus`/
 * `missingIntervals` reuse `analyzeUnitShiftCoverage` -- a PURE,
 * person-order-independent group coverage algorithm (see
 * `lib/domain/shiftCoverage.ts`) that evaluates the canonical shift
 * window against both roles' merged intervals. This deliberately does
 * NOT pick an arbitrary "target" person the way `analyzeShiftCounterparts`
 * does — the result is identical regardless of `personId`/`sourceCell`
 * ordering.
 */
function buildCoverageOverview(
  events: readonly Event[],
  shiftSchedule: ShiftSchedule,
  rangeDates: ReadonlySet<string>,
): ManagerShiftOverviewEntry[] {
  const shiftEvents = events.filter((event) => event.category === "shift" && rangeDates.has(event.date));

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
    });
  }

  return entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
  });
}

// ---------------------------------------------------------------------------
// Duties / absences
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Potential vs internal
// ---------------------------------------------------------------------------

function toManagerPotentialRequirementView(
  reconciliation: ManagerRequirementReconciliation,
  peopleById: ReadonlyMap<string, Person>,
): ManagerPotentialRequirementView {
  return {
    date: reconciliation.date,
    dutyFamily: reconciliation.dutyFamily,
    slot: reconciliation.slot,
    columnLabel: reconciliation.columnLabel,
    sourceAllocationLabel: reconciliation.sourceAllocationLabel,
    resolvedSourcePersonId: reconciliation.resolvedSourcePersonId,
    resolvedSourcePersonName: reconciliation.resolvedSourcePersonId
      ? (peopleById.get(reconciliation.resolvedSourcePersonId)?.name ?? null)
      : null,
    status: reconciliation.status,
    actualAssignees: reconciliation.actualAssignees,
    sourceConflict: reconciliation.sourceConflict,
  };
}
