import type { AssignmentTemporalState } from "@/lib/domain/assignmentTemporalState";
import type { AssignmentTiming } from "@/lib/domain/assignmentTiming";
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
 *
 * `timing` is server-resolved once against `localNow` (never re-derived
 * from raw text in the UI) so any timed display -- the today timeline in
 * particular -- can place an event correctly without recomputing shift
 * rules client-side. `status === "not_evaluable"` for every non-shift
 * category and for any shift whose exact hour can't be resolved -- no
 * invented start/end/duration.
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
  timing: AssignmentTiming;
}

/** A shift/duty `PersonalEventView`, additionally annotated with its resolved temporal state relative to `localNow`. */
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
 * personnelType, unrelated Events, and sourceSheet/sourceCell. `role` is
 * ANY role, not necessarily the opposite of the viewer's own -- a same-role
 * colleague (e.g. a second supervisor on the same shift) is a legitimate
 * roster entry here, not filtered out (see `PersonalShiftContext`).
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

/**
 * Roster + coverage context for one of the authenticated person's own
 * shifts -- two deliberately separate questions living side by side:
 * `primaryCounterparts`/`shadowCounterparts` answer "who else is actually
 * on this shift with me?" (`buildShiftRoster` — ANY role, same-role
 * colleagues included, never itself a coverage signal), while
 * `coverageStatus`/`missingIntervals` answer "is staffing adequate?"
 * (`analyzeShiftCounterparts` — specifically the OPPOSITE role, including
 * the multi-supervisor staffing waiver). Never infer one from the other:
 * a shift can legitimately show a same-role-only roster (e.g. two
 * supervisors, no technician) alongside a `"full"` `coverageStatus`.
 */
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

  /**
   * The authenticated person's own shift, duty, and absence Events -- past,
   * current, and future, every one present in the parsed schedule (unlike
   * `upcomingEvents`, which deliberately excludes finished history). Powers
   * "הלוח שלי" (`/schedule`), the personal monthly calendar. Deliberately
   * excludes every other `EventCategory` (constraint/status/context/
   * change_note/other/unknown) -- those aren't calendar-worthy entries on
   * their own. Deterministically ordered, same as every other array here.
   */
  calendarEvents: PersonalEventView[];

  currentAssignments: PersonalAssignmentView[];
  nextAssignmentGroup: PersonalNextAssignmentGroup | null;

  currentShiftContexts: PersonalShiftContext[];
  nextShiftContexts: PersonalShiftContext[];

  issues: PersonalIssue[];

  dutyBlocks: PersonalDutyBlock[];
  dutyActions: PersonalDutyAction[];
}
