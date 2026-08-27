import { EMERGENCY_DESK_NAMES } from "@/lib/domain/emergencyDesks";
import { groupEmergencyAssignmentsIntoShifts, type EmergencyAssignment, type EmergencyShift } from "@/lib/domain/emergencyShift";
import type { LocalNow } from "@/lib/domain/localNow";
import type { Person } from "@/lib/domain/types";
import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";

/** Only `id`/`name` are ever needed for the manager's own identity here -- deliberately narrower than a full `Person`, so a caller that already has just the authenticated profile (not a re-fetched roster `Person`) never needs an extra lookup. */
export interface EmergencyScheduleManagerIdentity {
  id: string;
  name: string;
}
import type { EmergencyParseDiagnostic } from "@/lib/parsers/emergencySchedule";
import type { SchedulePerspective, ScheduleRosterOption } from "./scheduleTypes";
import type {
  EmergencyDeskSlot,
  EmergencyEveryoneShiftEntry,
  EmergencyPersonalShiftEntry,
  EmergencyScheduleReadModel,
  EmergencyScheduleRosterEntry,
} from "./emergencyScheduleTypes";

export interface BuildEmergencyScheduleReadModelInput {
  /** Null for a normal (non-manager) user -- perspective is then always forced to "self". */
  manager: EmergencyScheduleManagerIdentity | null;
  /** Full parsed personnel -- only used to build the manager's roster selector and validate `requestedPersonId`. Empty/ignored for a non-manager. */
  people: readonly Person[];
  assignments: readonly EmergencyAssignment[];
  period: EmergencyModePeriod;
  fetchedAt: string;
  now: LocalNow;
  diagnostics: readonly EmergencyParseDiagnostic[];
  /** The authenticated caller's own person id -- "self" perspective always targets this, regardless of `requestedPersonId`. */
  selfPersonId: string;
  selfPersonName: string;
  /** Raw, unvalidated `?person=` value. Ignored entirely for a non-manager. */
  requestedPersonId: string | null;
}

type ResolvedPerspective = { kind: "self" } | { kind: "all" } | { kind: "person"; person: Person };

/** Same fail-closed resolution convention as `buildScheduleReadModel.ts`'s `resolveSchedulePerspective` -- an unknown/foreign/self-referencing id all normalize to "self", never a thrown error and never "all" by accident. */
function resolvePerspective(
  requestedPersonId: string | null,
  people: readonly Person[],
  managerId: string,
): ResolvedPerspective {
  if (requestedPersonId === null) return { kind: "self" };
  if (requestedPersonId === "all") return { kind: "all" };

  const person = people.find((candidate) => candidate.id === requestedPersonId);
  if (!person || person.id === managerId) return { kind: "self" };
  return { kind: "person", person };
}

function compareRosterOptions(a: ScheduleRosterOption, b: ScheduleRosterOption): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function buildRosterOptions(people: readonly Person[], managerId: string): ScheduleRosterOption[] {
  return people
    .filter((person) => person.id !== managerId)
    .map(
      (person): ScheduleRosterOption => ({
        id: person.id,
        name: person.name,
        personnelType: person.personnelType,
        isSupervisor: person.isSupervisor,
        isTechnician: person.isTechnician,
      }),
    )
    .sort(compareRosterOptions);
}

function toPersonalShiftEntry(shift: EmergencyShift, viewedPersonId: string): EmergencyPersonalShiftEntry {
  const ownDesks = shift.assignments.filter((a) => a.personId === viewedPersonId).map((a) => a.desk);
  const roster: EmergencyScheduleRosterEntry[] = shift.assignments
    .filter((a) => a.personId !== viewedPersonId)
    .map((a) => ({ personId: a.personId, personName: a.personName, desk: a.desk }));
  return { date: shift.date, period: shift.period, ownDesks, roster };
}

/** Exported for reuse by `buildEmergencyManagerOverview.ts` -- the Manager Area's previous/current/next operational overview needs the exact same full desk-grid shape for one shift, never a second definition of "which of the ten canonical desks is who". */
export function toEveryoneShiftEntry(shift: EmergencyShift): EmergencyEveryoneShiftEntry {
  const byDesk = new Map(shift.assignments.map((a) => [a.desk, a]));
  const desks: EmergencyDeskSlot[] = EMERGENCY_DESK_NAMES.map((desk) => {
    const assignment = byDesk.get(desk);
    return assignment
      ? { desk, personId: assignment.personId, personName: assignment.personName }
      : { desk, personId: null, personName: null };
  });
  return { date: shift.date, period: shift.period, desks };
}

/**
 * Pure, deterministic construction of `/schedule`'s Emergency Mode read
 * model -- mirrors `buildManagerScheduleReadModel`'s perspective
 * resolution exactly (same fail-closed rules for `?person=`), but builds
 * desk-based staffing instead of role coverage. No regular role-coverage
 * algorithm anywhere in this file (spec section 10).
 */
export function buildEmergencyScheduleReadModel(input: BuildEmergencyScheduleReadModelInput): EmergencyScheduleReadModel {
  const shifts = groupEmergencyAssignmentsIntoShifts(input.assignments);

  if (!input.manager) {
    return {
      fetchedAt: input.fetchedAt,
      localNow: input.now,
      period: input.period,
      diagnostics: [...input.diagnostics],
      manager: null,
      roster: [],
      perspective: "self",
      selectedPersonId: null,
      selectedPersonName: null,
      personalShifts: shifts.map((shift) => toPersonalShiftEntry(shift, input.selfPersonId)),
      everyoneShifts: null,
    };
  }

  const roster = buildRosterOptions(input.people, input.manager.id);
  const perspective = resolvePerspective(input.requestedPersonId, input.people, input.manager.id);

  if (perspective.kind === "all") {
    return {
      fetchedAt: input.fetchedAt,
      localNow: input.now,
      period: input.period,
      diagnostics: [...input.diagnostics],
      manager: { id: input.manager.id, name: input.manager.name },
      roster,
      perspective: "all",
      selectedPersonId: null,
      selectedPersonName: null,
      personalShifts: null,
      everyoneShifts: shifts.map(toEveryoneShiftEntry),
    };
  }

  const targetPersonId = perspective.kind === "person" ? perspective.person.id : input.selfPersonId;
  const targetPersonName = perspective.kind === "person" ? perspective.person.name : input.selfPersonName;

  const perspectiveLabel: SchedulePerspective = perspective.kind === "person" ? "person" : "self";

  return {
    fetchedAt: input.fetchedAt,
    localNow: input.now,
    period: input.period,
    diagnostics: [...input.diagnostics],
    manager: { id: input.manager.id, name: input.manager.name },
    roster,
    perspective: perspectiveLabel,
    selectedPersonId: perspectiveLabel === "person" ? targetPersonId : null,
    selectedPersonName: perspectiveLabel === "person" ? targetPersonName : null,
    personalShifts: shifts.map((shift) => toPersonalShiftEntry(shift, targetPersonId)),
    everyoneShifts: null,
  };
}
