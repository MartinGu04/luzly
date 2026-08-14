import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import type { ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { buildPersonalScheduleReadModel } from "./buildPersonalScheduleReadModel";
import { buildManagerAbsenceEntries, buildManagerDutyEntries, buildShiftStaffingOverview } from "./managerEventProjections";
import type { ScheduleReadModel, ScheduleRosterOption } from "./scheduleTypes";
import type { PersonalScheduleReadModel } from "./types";

/**
 * Wraps the authenticated person's own `PersonalScheduleReadModel` as a
 * "self" `ScheduleReadModel` with no manager scope at all -- used for every
 * normal user, and as the fail-closed fallback when a manager's fresh
 * re-authorization (see `schedule.ts`) can't be re-proven for this request.
 * `manager: null` / `roster: []` is exactly what tells the page to render
 * zero manager UI (PR #24 §3) -- never a client-side `isManager` flag.
 */
export function buildSelfOnlyScheduleReadModel(model: PersonalScheduleReadModel): ScheduleReadModel {
  return {
    fetchedAt: model.fetchedAt,
    localNow: model.localNow,
    manager: null,
    roster: [],
    perspective: "self",
    selectedPersonId: null,
    selectedPersonName: null,
    personal: model,
    everyone: null,
  };
}

export interface BuildManagerScheduleReadModelInput {
  /** The authenticated manager -- already verified `isManager === true` and freshly re-checked by the caller (see `managerWorkbookContext.ts`). */
  manager: Person;
  /** Full parsed personnel list -- everyone visible to the manager. */
  people: readonly Person[];
  /** Full parsed internal Event[] (every person). */
  events: readonly Event[];
  shiftSchedule: ShiftSchedule;
  fetchedAt: string;
  now: LocalNow;
  /** Every calendar date in the displayed month -- scopes "all" perspective's staffing/duties/absences. Unused for "self"/"person" (`PersonalScheduleReadModel` carries its own full, unscoped `shiftCalendarEvents`, filtered by month at the page like today). */
  monthDates: readonly string[];
  /**
   * Raw, unvalidated `?person=` value -- `null`/omitted means "self", the
   * literal string `"all"` means "everyone", anything else is a candidate
   * person id. NEVER trusted without validating against `people` --
   * see `resolveSchedulePerspective`.
   */
  requestedPersonId: string | null;
}

type ResolvedSchedulePerspective =
  | { kind: "self" }
  | { kind: "all" }
  | { kind: "person"; person: Person };

/**
 * Fail-closed resolution of the raw `?person=` param (PR #24 §9): an
 * unknown id, a stale id, malformed input, or an id outside `people` (the
 * manager's own currently-authorized roster) all fall back to SELF -- never
 * to "everyone", and never by throwing. Selecting the manager's own id
 * also normalizes to "self" (PR #24 §8: self mode prefers no `person`
 * param at all over an explicit self-referencing one).
 */
function resolveSchedulePerspective(
  requestedPersonId: string | null,
  people: readonly Person[],
  managerId: string,
): ResolvedSchedulePerspective {
  if (requestedPersonId === null) return { kind: "self" };
  if (requestedPersonId === "all") return { kind: "all" };

  const person = people.find((candidate) => candidate.id === requestedPersonId);
  if (!person || person.id === managerId) return { kind: "self" };
  return { kind: "person", person };
}

/** By name, then id as a stable tiebreak -- duplicate names stay a safe, deterministic order (the URL always selects by id, never by name). Same convention as `ManagerOverviewReadModel.roster`. */
function compareRosterOptions(a: ScheduleRosterOption, b: ScheduleRosterOption): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every person visible to the manager EXCEPT the manager themselves (PR #24 §6 -- they already have the explicit "אני" entry, never shown twice). */
function buildRosterOptions(people: readonly Person[], managerId: string): ScheduleRosterOption[] {
  return people
    .filter((person) => person.id !== managerId)
    .map((person): ScheduleRosterOption => ({ id: person.id, name: person.name }))
    .sort(compareRosterOptions);
}

/**
 * Pure, deterministic construction of a manager's `ScheduleReadModel` from
 * already-parsed domain data -- no network, no auth, no Date/UTC, mirrors
 * `buildManagerOverviewReadModel`'s purity contract. Never mutates any
 * input array.
 *
 * "self" and "person" both reuse `buildPersonalScheduleReadModel` outright
 * (PR #24 §11) -- the SAME architectural idea `ManagerOverviewReadModel.
 * selectedPerson` already uses -- rather than reimplementing any personal
 * domain logic. "self" is simply that call with `person = manager`, so a
 * manager's own view is byte-for-byte what a normal user with the same
 * Events would see. "all" builds a separate, explicitly-typed team
 * staffing projection (`buildShiftStaffingOverview` et al.) instead of
 * forcing per-date staffing into `PersonalEventView` (PR #24 §14).
 */
export function buildManagerScheduleReadModel(input: BuildManagerScheduleReadModelInput): ScheduleReadModel {
  const { manager, people, events, shiftSchedule, fetchedAt, now, monthDates, requestedPersonId } = input;

  const roster = buildRosterOptions(people, manager.id);
  const perspective = resolveSchedulePerspective(requestedPersonId, people, manager.id);

  if (perspective.kind === "all") {
    const dates = new Set(monthDates);
    const peopleById = new Map(people.map((person) => [person.id, person]));

    return {
      fetchedAt,
      localNow: now,
      manager: { id: manager.id, name: manager.name },
      roster,
      perspective: "all",
      selectedPersonId: null,
      selectedPersonName: null,
      personal: null,
      everyone: {
        staffing: buildShiftStaffingOverview(events, shiftSchedule, dates),
        duties: buildManagerDutyEntries(events, peopleById, dates),
        absences: buildManagerAbsenceEntries(events, peopleById, dates),
      },
    };
  }

  const targetPerson = perspective.kind === "person" ? perspective.person : manager;
  const personal = buildPersonalScheduleReadModel({ person: targetPerson, people, events, shiftSchedule, fetchedAt, now });

  return {
    fetchedAt,
    localNow: now,
    manager: { id: manager.id, name: manager.name },
    roster,
    perspective: perspective.kind === "person" ? "person" : "self",
    selectedPersonId: perspective.kind === "person" ? targetPerson.id : null,
    selectedPersonName: perspective.kind === "person" ? targetPerson.name : null,
    personal,
    everyone: null,
  };
}
