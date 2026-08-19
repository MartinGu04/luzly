import type { AbsenceKind, DutyFamily, EventCertainty, EventPeriod } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import type { IssueReason, IssueSeverity, RoleCapabilityMismatchMetadata } from "@/lib/domain/operationalIssues";
import type { ManagerRangeKey } from "@/lib/domain/dateRange";
import type { ManagerRequirementStatus, ManagerSourceConflict } from "@/lib/domain/potentialReconciliation";
import type { MissingCoverageRole } from "@/lib/domain/shiftCoverageRecommendation";
import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import type { MinuteInterval } from "@/lib/domain/shiftSchedule";
import type { ShiftSnapshotTriad } from "./shiftSnapshot";
import type { PersonalIssueTargetSummary, PersonalScheduleReadModel } from "./types";

/**
 * Manager-safe roster projection -- deliberately narrower than `Person`:
 * no `email`. Existing in the roster does not imply scheduled/active on
 * any date (same convention as `Person` itself).
 */
export interface ManagerPersonSummary {
  id: string;
  name: string;
  isManager: boolean;
  isTechnician: boolean;
  isSupervisor: boolean;
  personnelType: string | null;
}

/**
 * The resolved date range the manager overview is scoped to (echoes back
 * `ManagerDateRange` minus the plain `dates[]` list, which the read model
 * doesn't need to re-expose -- every section below is already filtered to
 * it).
 */
export interface ManagerRangeView {
  key: ManagerRangeKey;
  startDate: string;
  endDate: string;
  /** Set only when `key === "month"`. */
  month: { year: number; month: number } | null;
}

/** One safe, name-resolved candidate suggestion (PR #37) -- never a raw `Person`/`Event`. */
export interface ManagerRecommendationCandidate {
  personId: string;
  personName: string;
}

/**
 * A safe projection of `ShiftCoverageRecommendation` (PR #37) -- the
 * manager-only "who might be worth checking with?" candidate search for a
 * `shift_coverage_missing`/`shift_coverage_partial` issue. Only ever set
 * for those two reasons, and only once the domain layer could safely
 * establish at least one eligible candidate -- see
 * `lib/domain/shiftCoverageRecommendation.ts` for the full eligibility
 * rules this is built from. `fallbackCandidates` is only ever non-empty
 * for `missingRole === "technician"`, and only once `primaryCandidates`
 * is empty (see that module's own docstring for why).
 */
export interface ManagerIssueRecommendation {
  missingRole: MissingCoverageRole;
  primaryCandidates: ManagerRecommendationCandidate[];
  fallbackCandidates: ManagerRecommendationCandidate[];
}

/**
 * A safe projection of an `OperationalIssue`, scoped to the WHOLE unit
 * (unlike `PersonalIssue`, which is filtered to one person) -- built from
 * `detectOperationalIssues()` over the full manager-side parsed schedule,
 * never from the already-person-filtered personal read model. Still never
 * carries `sourceSheet`/`sourceCell`, raw evidence `Event[]`, or any
 * colleague field beyond `personId`/`personName`.
 */
export interface ManagerIssue {
  personId: string;
  personName: string;
  reason: IssueReason;
  severity: IssueSeverity;
  date: string;
  missingIntervals: MinuteInterval[] | null;
  metadata: RoleCapabilityMismatchMetadata | null;
  targetEvent: PersonalIssueTargetSummary | null;
  /** Only ever set for the manager's everyone-wide view -- see PR #37's `buildManagerOverviewReadModel.ts`. `PersonalIssue`/selected-person drill-down issues never carry this. */
  recommendation: ManagerIssueRecommendation | null;
}

/** One person's presence within a `ManagerShiftOverviewEntry` group. */
export interface ManagerShiftGroupPerson {
  personId: string;
  personName: string;
  certainty: EventCertainty;
  startTimeOverride: string | null;
  endTimeOverride: string | null;
}

/**
 * Presentation-safe per-role coverage diagnostic -- mirrors
 * `RoleCoverageDiagnostic` from `lib/domain/shiftCoverage.ts` exactly (same
 * `status`/`missingIntervals` shape), carried through unchanged. Never
 * carries the underlying raw `Event[]` the domain layer computed it from.
 */
export interface ManagerRoleCoverageView {
  status: CoverageStatus;
  missingIntervals: MinuteInterval[];
}

/**
 * One date+period shift group across EVERYONE (unlike `PersonalShiftContext`,
 * which is anchored to one person's own shift). `technicians`/`supervisors`
 * preserve every assigned person -- never collapsed to one -- with
 * shadow/handover people kept in their own separate lists. `coverageStatus`/
 * `missingIntervals` reuse the exact same `analyzeShiftCounterparts` domain
 * algorithm as everywhere else in the app (see
 * `buildManagerOverviewReadModel.ts` for the deterministic target-selection
 * note when several same-role people share a group). `roleCoverage` is the
 * SAME `analyzeUnitShiftCoverage()` call's per-role diagnostic (Design Pass
 * PR #21 §11/§12) -- not a second coverage computation -- so the UI can say
 * explicitly which role is missing/partial instead of inferring it from
 * empty name lists.
 */
export interface ManagerShiftOverviewEntry {
  date: string;
  period: EventPeriod;
  technicians: ManagerShiftGroupPerson[];
  supervisors: ManagerShiftGroupPerson[];
  shadowTechnicians: ManagerShiftGroupPerson[];
  shadowSupervisors: ManagerShiftGroupPerson[];
  coverageStatus: CoverageStatus;
  missingIntervals: MinuteInterval[];
  roleCoverage: {
    technician: ManagerRoleCoverageView;
    supervisor: ManagerRoleCoverageView;
  };
}

/** One typed duty Event across everyone, within the selected range. */
export interface ManagerDutyEntry {
  personId: string;
  personName: string;
  date: string;
  dutyFamily: DutyFamily;
  slot: number | null;
  certainty: EventCertainty;
}

/** One typed absence Event across everyone, within the selected range. */
export interface ManagerAbsenceEntry {
  personId: string;
  personName: string;
  date: string;
  absenceKind: AbsenceKind;
  certainty: EventCertainty;
}

/** The internal Event(s) that actually fulfill a `ManagerPotentialRequirementView` -- who really performs it, independent of who the Potential SOURCE said would supply it. */
export interface ManagerRequirementActualAssignee {
  personId: string;
  personName: string;
  certainty: EventCertainty;
}

/**
 * One reconciled Potential requirement row -- "פוטנציאל מול סידור". Built
 * from `PotentialAllocation` + `reconcilePotentialAllocations()`, never
 * from raw sheet cells. `resolvedSourcePersonName` is looked up from the
 * manager-safe roster (never a second identity guess). `actualAssignees`
 * is the SAFE, sanitized internal match — no email, no
 * `sourceSheet`/`sourceCell`. See `lib/domain/potentialReconciliation.ts`
 * for exactly how `status` is determined (date + typed duty requirement,
 * never by the source label matching a person) and what `sourceConflict`
 * means (independent of `status` — a requirement can be `covered` by a
 * replacement while still carrying a source conflict worth surfacing).
 */
export interface ManagerPotentialRequirementView {
  date: string;
  dutyFamily: DutyFamily;
  /** The exact internal slot this requirement was matched against (guard/reserve only). Null for every other family. */
  slot: number | null;
  columnLabel: string;
  sourceAllocationLabel: string;
  resolvedSourcePersonId: string | null;
  resolvedSourcePersonName: string | null;
  status: ManagerRequirementStatus;
  actualAssignees: ManagerRequirementActualAssignee[];
  sourceConflict: ManagerSourceConflict | null;
}

/** Whether this roster person has ever completed a Google sign-in -- derived from `PersonNotificationReadiness` (`unmapped_account` -> `not_logged_in`, `no_push_subscription`/`ready` -> `logged_in`), `null` when a personnel-data issue (`dataIssue`) means the question can't even be asked yet. */
export type ManagerAdoptionLoginStatus = "logged_in" | "not_logged_in";

/** Whether a logged-in person can currently receive a personal push notification -- meaningless (`null`) before `loginStatus === "logged_in"`. */
export type ManagerAdoptionNotificationStatus = "ready" | "not_enabled";

/** A כ"א roster problem, not a person's own failing -- see `lib/notifications/engine/readiness.ts`'s `missing_email`/`ambiguous_email`. Kept separate from `loginStatus`/`notificationStatus` (both `null` when this is set) so the UI never reads "no account" as "hasn't logged in" for someone the system could never have matched in the first place. */
export type ManagerAdoptionDataIssue = "missing_email" | "ambiguous_email";

/**
 * One roster person's adoption picture -- "התחברויות והתראות" (the manager
 * category this feeds). Built from `computeNotificationReadiness()`'s
 * single per-person `PersonNotificationReadiness` (see
 * `buildManagerOverviewReadModel.ts`'s `toManagerAdoptionPerson`), just
 * split into the two orthogonal questions a manager actually asks --
 * "has this person logged in?" and "can they receive notifications?" --
 * instead of one collapsed internal enum. `avatarUrl` is the SAME
 * presentation-only Google photo already available from the bulk Admin
 * API account lookup (`recipients.ts`'s `fetchAllUserIdsByEmail`) -- never
 * a new per-user fetch, and only ever set for a `logged_in` person (no
 * account, no photo). `needsNudge` is true exactly when a manager should
 * reach out: not yet logged in, or logged in but notifications aren't on
 * -- never true for a `ready` person or a `dataIssue` row (that's a roster
 * problem to fix, not a person to remind). Carries only
 * `personId`/`personName`/`avatarUrl` -- no email, no auth user id, no
 * push endpoint/keys.
 */
export interface ManagerAdoptionPersonView {
  personId: string;
  personName: string;
  avatarUrl: string | null;
  loginStatus: ManagerAdoptionLoginStatus | null;
  notificationStatus: ManagerAdoptionNotificationStatus | null;
  dataIssue: ManagerAdoptionDataIssue | null;
  needsNudge: boolean;
}

/**
 * The only counts the "התחברויות והתראות" category surfaces -- every one
 * answers a real management question (see `ManagerAdoptionPersonView`'s
 * docstring), never a decorative statistic. `totalCount` is the full
 * roster scope this was computed over; every other count is a subset of
 * it, derived from the SAME per-person pass (`toManagerAdoptionView`), so
 * they can never drift out of agreement with each other by construction.
 */
export interface ManagerAdoptionSummary {
  totalCount: number;
  loggedInCount: number;
  notLoggedInCount: number;
  notificationReadyCount: number;
  loggedInNotReadyCount: number;
  dataIssueCount: number;
}

/** The full "התחברויות והתראות" category payload -- every roster person's adoption state, plus the summary counts derived from the same pass. */
export interface ManagerAdoptionView {
  summary: ManagerAdoptionSummary;
  people: ManagerAdoptionPersonView[];
}

/**
 * The manager overview must distinguish "the privileged lookup was never
 * attempted" from "it was attempted and failed", never collapse both into
 * the same silent absence a viewer could mistake for "everyone is ready":
 * - `skipped` -- a person is selected (every category, including
 *   "התחברויות והתראות", only renders in the "everyone" scope), so
 *   `computeNotificationReadiness()` was never called at all.
 * - `unavailable` -- it WAS called, for the "everyone" scope, and the
 *   Supabase Admin API / `push_subscriptions` lookup itself failed (see
 *   `managerOverview.ts`). The manager sees a small neutral notice, not a
 *   silently missing category.
 * - `available` -- it succeeded; `view` is the safe projection (unlike the
 *   old מצב התראות aside, this is shown even when everyone is ready --
 *   "התחברויות והתראות" is a full category page, not an inline note that
 *   should disappear on a calm day).
 */
export type ManagerAdoptionState =
  | { status: "skipped" }
  | { status: "unavailable" }
  | { status: "available"; view: ManagerAdoptionView };

/**
 * The manager-only, broader-scope read model. Separate from
 * `PersonalScheduleReadModel` on purpose (see `README.md`) -- it may see
 * everyone, but every field here is still a typed, explicitly safe
 * projection. Never carries `sourceSheet`/`sourceCell`, the spreadsheet
 * ID, raw Google API objects, raw personnel rows, or auth internals.
 */
export interface ManagerOverviewReadModel {
  /**
   * `avatarUrl` is the SAME presentation-only Google profile photo the app
   * shell already carries for the current session (see
   * `lib/auth/currentUser.ts`) -- sourced from the request-scoped, already-
   * cached `getRequestPersonalSchedule()` call `managerWorkbookContext.ts`
   * makes anyway (identity verification), never a new fetch and never
   * looked up for anyone other than the manager viewing this page.
   */
  manager: { id: string; name: string; avatarUrl: string | null };
  fetchedAt: string;
  localNow: LocalNow;
  range: ManagerRangeView;

  /** Every person visible to the manager, deterministically ordered (by name, then id to break ties -- duplicate names stay safe). */
  roster: ManagerPersonSummary[];
  /** Null when scope is "everyone" (no person selected, or an invalid/unknown id fell back safely). */
  selectedPersonId: string | null;

  /** Global operational issues across everyone, within the selected range. */
  issues: ManagerIssue[];
  /** Unit-wide shift coverage overview within the selected range. */
  coverageOverview: ManagerShiftOverviewEntry[];
  /** Every duty Event across everyone, within the selected range. */
  duties: ManagerDutyEntry[];
  /** Every absence Event across everyone, within the selected range. */
  absences: ManagerAbsenceEntry[];
  /** Potential vs. internal reconciliation rows, within the selected range. */
  potentialRequirements: ManagerPotentialRequirementView[];

  /**
   * Login + push-notification adoption across the whole roster -- feeds
   * the "התחברויות והתראות" manager category. Always one of three explicit
   * states (`ManagerAdoptionState`) -- never a bare `null` conflating
   * "skipped" with "the lookup failed". See `managerOverview.ts`, which
   * skips the Supabase Admin API + bulk `push_subscriptions` calls
   * entirely on person-drilldown navigations, since no category (this one
   * included) renders there.
   */
  adoption: ManagerAdoptionState;

  /**
   * The selected person's OWN full personal read model, reused as-is from
   * `buildPersonalScheduleReadModel()` -- built from the same in-memory
   * manager snapshot (no per-person Google fetch, no reimplemented
   * current/next/counterpart/duty/issue logic). Null in the "everyone"
   * scope.
   */
  selectedPerson: PersonalScheduleReadModel | null;
  /** The selected person's own absences within the selected range -- `selectedPerson` itself doesn't carry a dedicated absences list. Empty in the "everyone" scope. */
  selectedPersonRangeAbsences: ManagerAbsenceEntry[];

  /**
   * The department-wide previous/current/next shift ("תמונת מצב משמרות"), for a
   * manager who is themselves shift-capable (`isShiftCapable`,
   * `lib/domain/personnelType.ts` -- `isSupervisor`/`isTechnician`, never a
   * title-string check) -- e.g. an אחמ״ש with manager access. `null` for a
   * manager with neither capability flag (a permanent/non-shift manager),
   * who already gets this exact same operational picture as their own Home
   * screen instead (`PermanentManagerHomeReadModel`, unaffected by this
   * field). Reuses `resolveShiftSnapshotTriad` (`shiftSnapshot.ts`)
   * outright -- the SAME previous/current/next resolution, roster/coverage
   * lookup, and progress timing that read model already computes, never a
   * second implementation. Always the actual neighboring department shifts
   * in chronological order, never filtered down to this manager's own
   * personal assignments.
   */
  managerShiftSnapshot: ShiftSnapshotTriad | null;
}
