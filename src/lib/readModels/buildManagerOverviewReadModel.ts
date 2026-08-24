import type { ManagerDateRange } from "@/lib/domain/dateRange";
import type { Event } from "@/lib/domain/event";
import { resolveFairnessPeriodIdentity } from "@/lib/domain/fairnessPeriod";
import type { LocalNow } from "@/lib/domain/localNow";
import {
  detectOperationalIssues,
  type IssueSeverity,
  type OperationalIssue,
} from "@/lib/domain/operationalIssues";
import type { PotentialAllocation } from "@/lib/domain/potentialAllocation";
import { buildPotentialDutyEventsForRoster } from "@/lib/domain/potentialDutyEvents";
import {
  reconcilePotentialAllocations,
  type ManagerRequirementReconciliation,
} from "@/lib/domain/potentialReconciliation";
import { isShiftCapable } from "@/lib/domain/personnelType";
import { scopeManagerPotentialAllocation } from "@/lib/domain/potentialSourceOwnership";
import { resolveReserveRoleParticipation, type ReserveRoleParticipationByPeriod } from "@/lib/domain/reserveParticipation";
import { buildShiftCoverageRecommendation } from "@/lib/domain/shiftCoverageRecommendation";
import type { ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import type { PersonReadinessResult } from "@/lib/notifications/engine/readiness";
import { buildPersonalScheduleReadModel } from "./buildPersonalScheduleReadModel";
import { buildManagerAbsenceEntries, buildManagerDutyEntries, buildShiftStaffingOverview } from "./managerEventProjections";
import { resolveShiftSnapshotTriad } from "./shiftSnapshot";
import type {
  ManagerAdoptionPersonView,
  ManagerAdoptionState,
  ManagerAdoptionSummary,
  ManagerAdoptionView,
  ManagerIssue,
  ManagerIssueRecommendation,
  ManagerOverviewReadModel,
  ManagerPersonSummary,
  ManagerPotentialRequirementView,
  ManagerRecommendationCandidate,
} from "./managerTypes";
import type { PersonalIssueTargetSummary } from "./types";

export interface BuildManagerOverviewReadModelInput {
  /** The authenticated manager -- already verified `isManager === true` by the caller (see `managerOverview.ts`). */
  manager: Person;
  /** The manager's own presentation-only Google profile photo, already resolved by the caller from the shared request-scoped identity -- never a new lookup here. */
  managerAvatarUrl: string | null;
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
  /**
   * PR #39 -- both half-year Potential sheets' Fairness-table participation
   * evidence, already structurally parsed/derived by the caller (never a
   * raw `RawSheet`/score here). Which side (h1/h2) applies is resolved per
   * ISSUE, from that issue's own `date` -- see `toManagerIssueRecommendation`.
   */
  reserveParticipationByPeriod: ReserveRoleParticipationByPeriod;
  shiftSchedule: ShiftSchedule;
  fetchedAt: string;
  now: LocalNow;
  range: ManagerDateRange;
  /** Raw, unvalidated -- null means "everyone"; validated against `people` below. */
  selectedPersonId: string | null;
  /**
   * The caller's own record of whether `computeNotificationReadiness()` was
   * skipped, attempted-and-failed, or attempted-and-succeeded (with its raw
   * per-person results) -- see `managerOverview.ts`'s `AdoptionReadinessLookup`.
   * Narrowed to `ManagerAdoptionState` below -- this builder never re-runs
   * the identity/subscription lookup itself, and never collapses "skipped"
   * and "failed" into the same value.
   */
  adoption: AdoptionReadinessLookup;
  /**
   * The caller's own record of the Personnel category's roster-avatar
   * account lookup -- see `managerOverview.ts`'s `RosterAvatarLookup`.
   * Narrowed to the safe `rosterAvatarByPersonId` projection below (never a
   * raw auth user id/email) -- both `skipped` and `unavailable` collapse to
   * an empty map, since the UI's only reaction to either is the same
   * initials fallback (unlike `adoption`, Personnel has no separate
   * "lookup failed" notice to show).
   */
  rosterAvatars: RosterAvatarLookup;
}

/**
 * What `managerOverview.ts` actually knows about the privileged
 * login/notification readiness lookup for THIS request, before this builder
 * narrows it to the safe `ManagerAdoptionState` the read model exposes.
 * Defined here (rather than in `managerOverview.ts`) purely to avoid an
 * import cycle -- `managerOverview.ts` already imports this file.
 */
export type AdoptionReadinessLookup =
  | { status: "skipped" }
  | { status: "unavailable" }
  | { status: "ok"; results: readonly PersonReadinessResult[] };

/**
 * What `managerOverview.ts` actually knows about the Personnel category's
 * privileged roster-avatar account lookup for THIS request -- the same
 * three-way shape as `AdoptionReadinessLookup` (never collapsing "never
 * attempted" and "attempted and failed" into the same silent absence), but
 * for a narrower, cheaper lookup: one bulk `fetchAllUserIdsByEmail()` call,
 * never `push_subscriptions`. `avatars` only ever contains a person whose
 * identity resolved unambiguously to a real, photo-bearing Supabase account
 * (see `loadRosterAvatarLookup`) -- every other roster person (no account,
 * no photo, ambiguous/missing email) is simply absent from the map, which
 * `ManagerRosterSection` reads as "show initials".
 */
export type RosterAvatarLookup =
  | { status: "skipped" }
  | { status: "unavailable" }
  | { status: "ok"; avatars: ReadonlyMap<string, string> };

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
    managerAvatarUrl,
    people,
    events,
    potentialAllocations,
    reserveParticipationByPeriod,
    shiftSchedule,
    fetchedAt,
    now,
    range,
    selectedPersonId,
    adoption: rawAdoption,
    rosterAvatars: rawRosterAvatars,
  } = input;

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const rangeDates = new Set(range.dates);

  const roster = [...people].map(toManagerPersonSummary).sort(compareRosterEntries);

  const resolvedSelectedPerson =
    selectedPersonId !== null ? (peopleById.get(selectedPersonId) ?? null) : null;

  const issues = detectOperationalIssues(events, people, shiftSchedule)
    .filter((issue) => rangeDates.has(issue.date))
    .sort(compareManagerIssues)
    .map((issue) => toManagerIssue(issue, peopleById, people, events, shiftSchedule, reserveParticipationByPeriod));

  const coverageOverview = buildShiftStaffingOverview(events, shiftSchedule, rangeDates);

  /**
   * Roster-wide duty-data completeness (same conversion `selectedPerson`
   * below reuses for one person, run once per roster member and merged in
   * here too) -- so a person whose duties live only in a תקשא"ס period
   * source, not "משמרות + תורנויות" at all, still appears in the range-scoped
   * duties list instead of looking duty-free. Deliberately ONLY feeds
   * `duties` -- `coverageOverview`/`issues`/`potentialRequirements` above
   * and `absences` below all keep reading the raw `events`, untouched.
   */
  const eventsWithPotentialDuties = [
    ...events,
    ...buildPotentialDutyEventsForRoster(potentialAllocations, people, events),
  ];
  const duties = buildManagerDutyEntries(eventsWithPotentialDuties, peopleById, rangeDates);

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
    ? buildPersonalScheduleReadModel({
        person: resolvedSelectedPerson,
        people,
        events,
        shiftSchedule,
        fetchedAt,
        now,
        potentialAllocations,
      })
    : null;

  const selectedPersonRangeAbsences = resolvedSelectedPerson
    ? absences.filter((entry) => entry.personId === resolvedSelectedPerson.id)
    : [];

  const adoption = toManagerAdoptionState(rawAdoption, peopleById);
  const rosterAvatarByPersonId = rawRosterAvatars.status === "ok" ? rawRosterAvatars.avatars : new Map<string, string>();

  // "תמונת מצב משמרות" -- only for a manager who is themselves shift-capable
  // (isSupervisor/isTechnician, never a title-string check). Computed
  // unconditionally regardless of `range`/`selectedPersonId` -- this is the
  // manager's own live "what's happening around me now" snapshot, never
  // scoped to the page's own date-range navigation or a drilled-into
  // person, same "always now" convention `PermanentManagerHomeReadModel`
  // already established. Purely in-memory (no extra Google/Supabase call):
  // `events`/`shiftSchedule`/`now` are already this function's own inputs.
  const managerShiftSnapshot = isShiftCapable(manager) ? resolveShiftSnapshotTriad(events, shiftSchedule, now) : null;

  return {
    manager: { id: manager.id, name: manager.name, avatarUrl: managerAvatarUrl },
    fetchedAt,
    localNow: now,
    range: { key: range.key, startDate: range.startDate, endDate: range.endDate, month: range.month },
    roster,
    selectedPersonId: resolvedSelectedPerson?.id ?? null,
    issues,
    coverageOverview,
    duties,
    absences,
    potentialRequirements,
    selectedPerson,
    selectedPersonRangeAbsences,
    adoption,
    rosterAvatarByPersonId,
    managerShiftSnapshot,
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

function toManagerIssue(
  issue: OperationalIssue,
  peopleById: ReadonlyMap<string, Person>,
  people: readonly Person[],
  events: readonly Event[],
  shiftSchedule: ShiftSchedule,
  reserveParticipationByPeriod: ReserveRoleParticipationByPeriod,
): ManagerIssue {
  return {
    personId: issue.personId,
    personName: peopleById.get(issue.personId)?.name ?? "",
    reason: issue.reason,
    severity: issue.severity,
    date: issue.date,
    missingIntervals: issue.missingIntervals,
    metadata: issue.metadata,
    targetEvent: issue.targetEvent ? toIssueTargetSummary(issue.targetEvent) : null,
    recommendation: toManagerIssueRecommendation(
      issue,
      people,
      events,
      shiftSchedule,
      peopleById,
      reserveParticipationByPeriod,
    ),
  };
}

/**
 * PR #37 -- only ever attempted for `shift_coverage_missing`/
 * `shift_coverage_partial` (`buildShiftCoverageRecommendation` itself
 * returns `null` for every other reason, and whenever no eligible
 * candidate can be safely established). Resolves candidate ids to safe
 * `{personId, personName}` pairs here -- the domain layer only ever deals
 * in ids, never names/raw `Person`.
 *
 * PR #39: selects which half-year's Fairness participation evidence
 * applies via `resolveFairnessPeriodIdentity`, keyed off THIS issue's own
 * `date` (never a single "now" for the whole overview) -- an issue in a
 * past/future month still gets evaluated against the Fairness table that
 * actually covers it, exactly like Manager Fairness's own period
 * resolution (`managerFairness.ts`) does for its page-level `?period=`.
 * `resolveReserveRoleParticipation` additionally requires that resolved
 * period's YEAR to match the evidence source's own year -- an issue whose
 * date resolves to "h1" but falls in a DIFFERENT year than the fetched h1
 * sheet actually represents gets no Fairness evidence at all (safe empty),
 * never a same-half evidence set borrowed across years.
 */
function toManagerIssueRecommendation(
  issue: OperationalIssue,
  people: readonly Person[],
  events: readonly Event[],
  shiftSchedule: ShiftSchedule,
  peopleById: ReadonlyMap<string, Person>,
  reserveParticipationByPeriod: ReserveRoleParticipationByPeriod,
): ManagerIssueRecommendation | null {
  const requestedPeriod = resolveFairnessPeriodIdentity(null, { date: issue.date, minuteOfDay: 0 });
  const reserveParticipation = resolveReserveRoleParticipation(reserveParticipationByPeriod, requestedPeriod);
  const recommendation = buildShiftCoverageRecommendation(issue, people, events, shiftSchedule, reserveParticipation);
  if (!recommendation) return null;

  const toCandidate = (personId: string): ManagerRecommendationCandidate => ({
    personId,
    personName: peopleById.get(personId)?.name ?? "",
  });

  return {
    missingRole: recommendation.missingRole,
    primaryCandidates: recommendation.primaryCandidateIds.map(toCandidate),
    fallbackCandidates: recommendation.fallbackCandidateIds.map(toCandidate),
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

// ---------------------------------------------------------------------------
// Login + notification adoption
// ---------------------------------------------------------------------------

/**
 * Turns `managerOverview.ts`'s raw `AdoptionReadinessLookup` into the exact
 * three-state `ManagerAdoptionState` the read model exposes --
 * `skipped`/`unavailable` pass straight through unchanged (never conflated
 * with each other, and never collapsed into a bare `null`); only `ok` is
 * narrowed further, via `toManagerAdoptionView`.
 */
function toManagerAdoptionState(
  lookup: AdoptionReadinessLookup,
  peopleById: ReadonlyMap<string, Person>,
): ManagerAdoptionState {
  if (lookup.status !== "ok") return { status: lookup.status };
  return { status: "available", view: toManagerAdoptionView(lookup.results, peopleById) };
}

/**
 * Splits `computeNotificationReadiness()`'s single per-person
 * `PersonNotificationReadiness` into the two orthogonal questions
 * "התחברויות והתראות" actually asks -- has this person logged in, and can
 * they receive notifications -- rather than exposing the collapsed
 * five-value engine enum directly. See `ManagerAdoptionPersonView`'s
 * docstring for the exact mapping; every branch here is exhaustive over
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
 * to the safe manager projection -- every person survives here (unlike the
 * old מצב התראות aside, which dropped every `ready` person), since
 * "התחברויות והתראות" is a full roster picture, not just a blockers list.
 * The summary counts are derived from the SAME single pass, so they can
 * never drift out of agreement with `people` by construction.
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
