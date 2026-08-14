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
import { scopeManagerPotentialAllocation } from "@/lib/domain/potentialSourceOwnership";
import type { ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { buildPersonalScheduleReadModel } from "./buildPersonalScheduleReadModel";
import { buildManagerAbsenceEntries, buildManagerDutyEntries, buildShiftStaffingOverview } from "./managerEventProjections";
import type {
  ManagerIssue,
  ManagerOverviewReadModel,
  ManagerPersonSummary,
  ManagerPotentialRequirementView,
} from "./managerTypes";
import type { PersonalIssueTargetSummary } from "./types";

export interface BuildManagerOverviewReadModelInput {
  /** The authenticated manager -- already verified `isManager === true` by the caller (see `managerOverview.ts`). */
  manager: Person;
  /** Full parsed personnel list -- everyone visible to the manager. */
  people: readonly Person[];
  /** Full parsed internal Event[] (every person). */
  events: readonly Event[];
  /**
   * Combined H1 + H2 Potential allocations, structurally parsed, never
   * fuzzy-matched -- covers EVERY organizational source on the sheet, not
   * just this team's. This builder narrows that down to this team's own
   * responsibility before reconciliation (PR #16 §5/§27) -- see
   * `isManagerOwnedPotentialAllocation` below.
   */
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

  const coverageOverview = buildShiftStaffingOverview(events, shiftSchedule, rangeDates);

  const duties = buildManagerDutyEntries(events, peopleById, rangeDates);

  const absences = buildManagerAbsenceEntries(events, peopleById, rangeDates);

  // Manager Overview is intentionally scoped to this team's own Potential
  // responsibility (PR #16) -- filtered BEFORE reconciliation, so an
  // external organizational source (or a genuinely unrecognized one) never
  // reaches `reconcilePotentialAllocations`, never contributes a "missing"
  // row, and never affects any problem/attention count derived from it.
  // The parser itself stays broad (`parsePotentialSheet` parses every
  // source); only this manager-facing projection narrows the scope.
  //
  // `scopeManagerPotentialAllocation` classifies each allocation exactly
  // ONCE and also enriches a short/annotated person source's
  // `resolvedSourcePersonId` (the parser only resolves exact full names)
  // so `sourceConflict` detection below still works for it -- never
  // classify the same allocation twice.
  const scopedPotentialAllocations = potentialAllocations
    .filter((allocation) => rangeDates.has(allocation.date))
    .map((allocation) => scopeManagerPotentialAllocation(allocation, people))
    .filter((allocation): allocation is PotentialAllocation => allocation !== null);

  const potentialRequirements: ManagerPotentialRequirementView[] = reconcilePotentialAllocations(
    scopedPotentialAllocations,
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
