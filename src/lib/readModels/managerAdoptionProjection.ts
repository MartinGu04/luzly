import type { Person } from "@/lib/domain/types";
import type { PersonReadinessResult } from "@/lib/notifications/engine/readiness";
import type {
  ManagerAdoptionPersonView,
  ManagerAdoptionState,
  ManagerAdoptionSummary,
  ManagerAdoptionView,
  ManagerPersonSummary,
} from "./managerTypes";

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

/** The manager-safe roster projection every caller (Manager Overview, the standalone Notification Center) builds from the same full `Person[]` -- deliberately narrower than `Person`: no `email`. */
export function toManagerPersonSummary(person: Person): ManagerPersonSummary {
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
export function compareRosterEntries(a: ManagerPersonSummary, b: ManagerPersonSummary): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The map+sort combined -- the exact roster projection every manager-safe caller needs, never a raw `Person[]` reaching a read model's own output. */
export function buildManagerRoster(people: readonly Person[]): ManagerPersonSummary[] {
  return [...people].map(toManagerPersonSummary).sort(compareRosterEntries);
}

// ---------------------------------------------------------------------------
// Login + notification adoption
// ---------------------------------------------------------------------------

/**
 * What a caller (`managerOverview.ts`'s Manager Overview loader, or the
 * standalone Notification Center's own loader) actually knows about the
 * privileged login/notification readiness lookup for THIS request, before
 * `toManagerAdoptionState` below narrows it to the safe `ManagerAdoptionState`
 * a read model exposes. Shared here (rather than duplicated per caller) so
 * both loaders narrow the exact same three-way shape identically.
 */
export type AdoptionReadinessLookup =
  | { status: "skipped" }
  | { status: "unavailable" }
  | { status: "ok"; results: readonly PersonReadinessResult[] };

/**
 * Turns a caller's raw `AdoptionReadinessLookup` into the exact three-state
 * `ManagerAdoptionState` a read model exposes -- `skipped`/`unavailable` pass
 * straight through unchanged (never conflated with each other, and never
 * collapsed into a bare `null`); only `ok` is narrowed further, via
 * `toManagerAdoptionView`.
 */
export function toManagerAdoptionState(
  lookup: AdoptionReadinessLookup,
  peopleById: ReadonlyMap<string, Person>,
): ManagerAdoptionState {
  if (lookup.status !== "ok") return { status: lookup.status };
  return { status: "available", view: toManagerAdoptionView(lookup.results, peopleById) };
}

/**
 * Splits `computeNotificationReadiness()`'s single per-person
 * `PersonNotificationReadiness` into the two orthogonal questions the
 * Manager UI actually asks -- has this person logged in, and can they
 * receive notifications -- rather than exposing the collapsed five-value
 * engine enum directly. See `ManagerAdoptionPersonView`'s docstring for the
 * exact mapping; every branch here is exhaustive over
 * `PersonNotificationReadiness`, so a new engine status would fail to
 * compile rather than silently falling through.
 */
function toManagerAdoptionPerson(result: PersonReadinessResult, personName: string): ManagerAdoptionPersonView {
  const base = { personId: result.personId, personName, avatarUrl: result.avatarUrl };

  switch (result.status) {
    case "missing_email":
      return { ...base, avatarUrl: null, loginStatus: null, notificationStatus: null, dataIssue: "missing_email", needsNudge: false };
    case "ambiguous_email":
      return { ...base, avatarUrl: null, loginStatus: null, notificationStatus: null, dataIssue: "ambiguous_email", needsNudge: false };
    case "unmapped_account":
      return { ...base, avatarUrl: null, loginStatus: "not_logged_in", notificationStatus: null, dataIssue: null, needsNudge: true };
    case "no_push_subscription":
      return { ...base, loginStatus: "logged_in", notificationStatus: "not_enabled", dataIssue: null, needsNudge: true };
    case "ready":
      return { ...base, loginStatus: "logged_in", notificationStatus: "ready", dataIssue: null, needsNudge: false };
  }
}

/**
 * Narrows the raw per-person `computeNotificationReadiness()` results down
 * to the safe manager projection -- every person survives here (never just a
 * blockers list), since "התחברויות" (Manager Overview) and the standalone
 * Notification Center both need the full roster picture. The summary counts
 * are derived from the SAME single pass, so they can never drift out of
 * agreement with `people` by construction.
 */
function toManagerAdoptionView(
  results: readonly PersonReadinessResult[],
  peopleById: ReadonlyMap<string, Person>,
): ManagerAdoptionView {
  const people = results
    .map((result) => toManagerAdoptionPerson(result, peopleById.get(result.personId)?.name ?? ""))
    .sort(compareAdoptionPeople);

  const summary: ManagerAdoptionSummary = {
    totalCount: people.length,
    loggedInCount: people.filter((p) => p.loginStatus === "logged_in").length,
    notLoggedInCount: people.filter((p) => p.loginStatus === "not_logged_in").length,
    notificationReadyCount: people.filter((p) => p.notificationStatus === "ready").length,
    loggedInNotReadyCount: people.filter((p) => p.notificationStatus === "not_enabled").length,
    dataIssueCount: people.filter((p) => p.dataIssue !== null).length,
  };

  return { summary, people };
}

/** By name, then id as a stable tiebreak -- same convention as `compareRosterEntries`. */
function compareAdoptionPeople(a: ManagerAdoptionPersonView, b: ManagerAdoptionPersonView): number {
  if (a.personName !== b.personName) return a.personName < b.personName ? -1 : 1;
  return a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0;
}
