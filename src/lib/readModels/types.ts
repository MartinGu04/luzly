import type { AssignmentTemporalState } from "@/lib/domain/assignmentTemporalState";
import type { DerivedDutyActionType } from "@/lib/domain/dutyActions";
import type { DutyBlockCertainty, WeekendCompleteness } from "@/lib/domain/dutyBlocks";
import type {
  AbsenceKind,
  DutyFamily,
  EventCategory,
  EventCertainty,
  EventPeriod,
  EventRole,
} from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import type { IssueReason, IssueSeverity, RoleCapabilityMismatchMetadata } from "@/lib/domain/operationalIssues";
import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import type { MinuteInterval } from "@/lib/domain/shiftSchedule";

/**
 * The authenticated person's own safe profile. Deliberately excludes
 * `email` — the authenticated email belongs to the auth boundary, not the
 * presentation/read-model layer.
 */
export interface PersonalProfile {
  id: string;
  name: string;
  isManager: boolean;
  isTechnician: boolean;
  isSupervisor: boolean;
  personnelType: string | null;
}

/**
 * A client-safe projection of one of the authenticated person's own
 * `Event`s. `rawValue` is included (unlike any colleague-facing
 * projection) because unknown/free-text assignments must stay displayable
 * verbatim for the person they belong to. Never includes `sourceSheet`,
 * `sourceCell`, `personId`, or `personName` — those are workbook-origin /
 * identity fields with no place in a serialized read model.
 */
export interface PersonalEventView {
  date: string;
  title: string;
  rawValue: string;
  category: EventCategory;
  certainty: EventCertainty;
  role: EventRole;
  period: EventPeriod;
  slot: number | null;
  shadow: boolean;
  startTimeOverride: string | null;
  endTimeOverride: string | null;
  dutyFamily: DutyFamily | null;
  absenceKind: AbsenceKind | null;
  changeNote: string | null;
}

/** A shift/duty `PersonalEventView`, annotated with its resolved timing state. */
export interface PersonalAssignmentView extends PersonalEventView {
  temporalState: AssignmentTemporalState;
}

/**
 * The earliest upcoming assignment date/time group after
 * `currentAssignments`. May contain more than one Event when several
 * assignments share the same next logical date/start.
 */
export interface PersonalNextAssignmentGroup {
  date: string;
  events: PersonalAssignmentView[];
}

/**
 * Minimal colleague projection for "who is with me?" — deliberately
 * excludes email, manager flag, technician/supervisor capability flags,
 * personnelType, unrelated Events, and sourceSheet/sourceCell.
 */
export interface PersonalCounterpart {
  personId: string;
  personName: string;
  role: EventRole;
  certainty: EventCertainty;
  shadow: boolean;
  period: EventPeriod;
  startTimeOverride: string | null;
  endTimeOverride: string | null;
}

/** Counterpart context for one of the authenticated person's own shifts. */
export interface PersonalShiftContext {
  date: string;
  period: EventPeriod;
  role: EventRole;
  coverageStatus: CoverageStatus;
  missingIntervals: MinuteInterval[];
  primaryCounterparts: PersonalCounterpart[];
  shadowCounterparts: PersonalCounterpart[];
}

/** Sanitized target-Event summary for a `PersonalIssue` — never the raw Event. */
export interface PersonalIssueTargetSummary {
  date: string;
  category: EventCategory;
  title: string;
  role: EventRole;
  period: EventPeriod;
}

/**
 * A safe projection of an `OperationalIssue` scoped to the authenticated
 * person. Never carries `sourceSheet`/`sourceCell` or unrelated personnel
 * data — no raw evidence `Event[]`, just a sanitized target summary.
 */
export interface PersonalIssue {
  reason: IssueReason;
  severity: IssueSeverity;
  date: string;
  missingIntervals: MinuteInterval[] | null;
  metadata: RoleCapabilityMismatchMetadata | null;
  targetEvent: PersonalIssueTargetSummary | null;
}

/** Safe `DutyBlock` projection — no `personId`, no raw `events`. */
export interface PersonalDutyBlock {
  dutyFamily: DutyFamily;
  slot: number | null;
  startDate: string;
  endDate: string;
  dates: string[];
  certainty: DutyBlockCertainty;
  dayCount: number;
  weekendCompleteness: WeekendCompleteness;
}

/** Safe `DerivedDutyAction` projection — no `personId`, no nested block/source Events. */
export interface PersonalDutyAction {
  type: DerivedDutyActionType;
  date: string;
  localTime: string;
  dutyFamily: DutyFamily;
  slot: number | null;
}

/**
 * The full server-computed, per-person, already-filtered view of the
 * schedule. Explicitly safe to serialize to the authenticated person's own
 * browser session — never carries other people's Events, raw workbook
 * objects, or identity fields beyond this person's own safe profile.
 */
export interface PersonalScheduleReadModel {
  person: PersonalProfile;
  fetchedAt: string;
  localNow: LocalNow;

  todayEvents: PersonalEventView[];
  upcomingEvents: PersonalEventView[];

  currentAssignments: PersonalAssignmentView[];
  nextAssignmentGroup: PersonalNextAssignmentGroup | null;

  currentShiftContexts: PersonalShiftContext[];
  nextShiftContexts: PersonalShiftContext[];

  issues: PersonalIssue[];

  dutyBlocks: PersonalDutyBlock[];
  dutyActions: PersonalDutyAction[];
}
