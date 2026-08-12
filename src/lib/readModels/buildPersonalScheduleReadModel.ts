import {
  classifyAssignmentTemporalState,
  isEventStillRelevant,
} from "@/lib/domain/assignmentTemporalState";
import type { DerivedDutyAction } from "@/lib/domain/dutyActions";
import { deriveDutyActions } from "@/lib/domain/dutyActions";
import { buildDutyBlocks, type DutyBlock } from "@/lib/domain/dutyBlocks";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import {
  detectOperationalIssues,
  type IssueSeverity,
  type OperationalIssue,
} from "@/lib/domain/operationalIssues";
import { analyzeShiftCounterparts } from "@/lib/domain/shiftCoverage";
import { resolveEventShiftInterval, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import type {
  PersonalAssignmentView,
  PersonalCounterpart,
  PersonalDutyAction,
  PersonalDutyBlock,
  PersonalEventView,
  PersonalIssue,
  PersonalIssueTargetSummary,
  PersonalNextAssignmentGroup,
  PersonalProfile,
  PersonalScheduleReadModel,
  PersonalShiftContext,
} from "./types";

export interface BuildPersonalScheduleReadModelInput {
  /** The authenticated Person this read model is being built for. */
  person: Person;
  /** Full parsed personnel list — needed for capability-mismatch issue detection. */
  people: readonly Person[];
  /** Full server-side parsed Event set (every person) — never returned as-is. */
  events: readonly Event[];
  shiftSchedule: ShiftSchedule;
  fetchedAt: string;
  now: LocalNow;
}

/**
 * Pure, deterministic construction of the authenticated person's safe
 * `PersonalScheduleReadModel` from already-parsed domain data. No network,
 * no auth, no Date/UTC — every temporal decision goes through `now`
 * (an explicit `LocalNow`) and the existing shift/duty domain rules.
 *
 * Never mutates `events`/`people`/`person`, and never lets input Event
 * order affect output order — every array below is explicitly sorted.
 */
export function buildPersonalScheduleReadModel(
  input: BuildPersonalScheduleReadModelInput,
): PersonalScheduleReadModel {
  const { person, people, events, shiftSchedule, fetchedAt, now } = input;

  const personEvents = events.filter((event) => event.personId === person.id);
  const sortedPersonEvents = [...personEvents].sort((a, b) => compareEventsForDisplay(a, b, shiftSchedule));

  const todayEvents = sortedPersonEvents.filter((event) => event.date === now.date).map(toEventView);

  const upcomingEvents = sortedPersonEvents
    .filter((event) => isEventStillRelevant(event, shiftSchedule, now))
    .map(toEventView);

  const assignmentEvents = sortedPersonEvents.filter(isAssignmentEvent);

  const currentAssignments = assignmentEvents
    .filter((event) => classifyAssignmentTemporalState(event, shiftSchedule, now) === "current")
    .map((event) => toAssignmentView(event, shiftSchedule, now));

  const upcomingAssignments = assignmentEvents.filter(
    (event) => classifyAssignmentTemporalState(event, shiftSchedule, now) === "upcoming",
  );

  const nextGroupEvents = selectEarliestGroup(upcomingAssignments, shiftSchedule);
  const nextAssignmentGroup: PersonalNextAssignmentGroup | null =
    nextGroupEvents.length === 0
      ? null
      : {
          date: nextGroupEvents[0].date,
          events: nextGroupEvents.map((event) => toAssignmentView(event, shiftSchedule, now)),
        };

  const currentShiftEvents = assignmentEvents.filter(
    (event) =>
      event.category === "shift" && classifyAssignmentTemporalState(event, shiftSchedule, now) === "current",
  );
  const nextShiftEvents = selectEarliestGroup(
    assignmentEvents.filter(
      (event) =>
        event.category === "shift" &&
        classifyAssignmentTemporalState(event, shiftSchedule, now) === "upcoming",
    ),
    shiftSchedule,
  );

  const currentShiftContexts = currentShiftEvents.map((event) => buildShiftContext(event, events, shiftSchedule));
  const nextShiftContexts = nextShiftEvents.map((event) => buildShiftContext(event, events, shiftSchedule));

  const allIssues = detectOperationalIssues(events, people, shiftSchedule);
  const issues = allIssues
    .filter((issue) => issue.personId === person.id)
    .filter((issue) => isIssueRelevant(issue, shiftSchedule, now))
    .sort(compareIssues)
    .map(toPersonalIssue);

  const dutyBlocks = buildDutyBlocks(personEvents);
  const dutyActions = deriveDutyActions(dutyBlocks).filter((action) => action.date >= now.date);

  return {
    person: toProfile(person),
    fetchedAt,
    localNow: now,
    todayEvents,
    upcomingEvents,
    currentAssignments,
    nextAssignmentGroup,
    currentShiftContexts,
    nextShiftContexts,
    issues,
    dutyBlocks: dutyBlocks.map(toDutyBlockView),
    dutyActions: dutyActions.map(toDutyActionView),
  };
}

function isAssignmentEvent(event: Event): boolean {
  return event.category === "shift" || event.category === "duty";
}

// ---------------------------------------------------------------------------
// Deterministic ordering
// ---------------------------------------------------------------------------

/** Resolved shift start minute for sorting; unresolved/non-shift sorts last within its date. */
function effectiveStartMinuteForSort(event: Event, schedule: ShiftSchedule): number {
  const resolution = resolveEventShiftInterval(event, schedule);
  return resolution.status === "resolved" ? resolution.interval.startMinute : Number.POSITIVE_INFINITY;
}

/**
 * date -> effective shift start -> category -> a stable, source-independent
 * tie-breaker. `sourceSheet`/`sourceCell` are used here only as an internal
 * sort key -- they are never present on any exposed projection.
 */
function compareEventsForDisplay(a: Event, b: Event, schedule: ShiftSchedule): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;

  const startA = effectiveStartMinuteForSort(a, schedule);
  const startB = effectiveStartMinuteForSort(b, schedule);
  if (startA !== startB) return startA - startB;

  if (a.category !== b.category) return a.category < b.category ? -1 : 1;
  if (a.sourceSheet !== b.sourceSheet) return a.sourceSheet < b.sourceSheet ? -1 : 1;
  return a.sourceCell < b.sourceCell ? -1 : a.sourceCell > b.sourceCell ? 1 : 0;
}

interface AssignmentSortKey {
  date: string;
  order: number;
}

function assignmentSortKey(event: Event, schedule: ShiftSchedule): AssignmentSortKey {
  const resolution = resolveEventShiftInterval(event, schedule);
  const order = resolution.status === "resolved" ? resolution.interval.startMinute : Number.POSITIVE_INFINITY;
  return { date: event.date, order };
}

function compareAssignmentSortKeys(a: AssignmentSortKey, b: AssignmentSortKey): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.order - b.order;
}

/**
 * Picks the earliest (date, effective-start) group among `events` and
 * returns every event that shares that exact key, deterministically
 * ordered. Used for both `nextAssignmentGroup` and the "next shift" pick
 * that drives `nextShiftContexts` -- never invents a time for entries whose
 * exact hour can't be resolved (they simply sort after resolved ones on the
 * same date via `Number.POSITIVE_INFINITY`).
 */
function selectEarliestGroup(events: readonly Event[], schedule: ShiftSchedule): Event[] {
  if (events.length === 0) return [];

  let bestKey = assignmentSortKey(events[0], schedule);
  for (const event of events.slice(1)) {
    const key = assignmentSortKey(event, schedule);
    if (compareAssignmentSortKeys(key, bestKey) < 0) bestKey = key;
  }

  return events
    .filter((event) => {
      const key = assignmentSortKey(event, schedule);
      return key.date === bestKey.date && key.order === bestKey.order;
    })
    .sort((a, b) => compareEventsForDisplay(a, b, schedule));
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<IssueSeverity, number> = { critical: 0, review: 1, info: 2 };

function compareIssues(a: OperationalIssue, b: OperationalIssue): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (SEVERITY_ORDER[a.severity] !== SEVERITY_ORDER[b.severity]) {
    return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  }
  if (a.reason !== b.reason) return a.reason < b.reason ? -1 : 1;

  const keyA = issueTargetSortKey(a);
  const keyB = issueTargetSortKey(b);
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

/** Internal-only sort key (sourceSheet/sourceCell never leave this file). */
function issueTargetSortKey(issue: OperationalIssue): string {
  if (issue.targetEvent) return `${issue.targetEvent.sourceSheet}!${issue.targetEvent.sourceCell}`;
  return issue.events.map((event) => `${event.sourceSheet}!${event.sourceCell}`).join(",");
}

/**
 * An issue is relevant if it's dated today or later, or if its evidence is
 * a still-current overnight shift dated yesterday -- the same
 * carry-forward rule as `upcomingEvents`, so a still-active overnight
 * shift's coverage issue is never lost merely because `issue.date` is
 * yesterday.
 */
function isIssueRelevant(issue: OperationalIssue, schedule: ShiftSchedule, now: LocalNow): boolean {
  const evidenceEvent = issue.targetEvent ?? issue.events.find((event) => event.date === issue.date) ?? null;
  if (!evidenceEvent) return issue.date >= now.date;
  return isEventStillRelevant(evidenceEvent, schedule, now);
}

// ---------------------------------------------------------------------------
// Safe projections
// ---------------------------------------------------------------------------

function toProfile(person: Person): PersonalProfile {
  return {
    id: person.id,
    name: person.name,
    isManager: person.isManager,
    isTechnician: person.isTechnician,
    isSupervisor: person.isSupervisor,
    personnelType: person.personnelType,
  };
}

function toEventView(event: Event): PersonalEventView {
  return {
    date: event.date,
    title: event.title,
    rawValue: event.rawValue,
    category: event.category,
    certainty: event.certainty,
    role: event.role,
    period: event.period,
    slot: event.slot,
    shadow: event.shadow,
    startTimeOverride: event.startTimeOverride,
    endTimeOverride: event.endTimeOverride,
    dutyFamily: event.dutyFamily,
    absenceKind: event.absenceKind,
    changeNote: event.changeNote,
  };
}

function toAssignmentView(event: Event, schedule: ShiftSchedule, now: LocalNow): PersonalAssignmentView {
  return {
    ...toEventView(event),
    temporalState: classifyAssignmentTemporalState(event, schedule, now),
  };
}

function toCounterpart(event: Event): PersonalCounterpart {
  return {
    personId: event.personId,
    personName: event.personName,
    role: event.role,
    certainty: event.certainty,
    shadow: event.shadow,
    period: event.period,
    startTimeOverride: event.startTimeOverride,
    endTimeOverride: event.endTimeOverride,
  };
}

function buildShiftContext(
  target: Event,
  allEvents: readonly Event[],
  schedule: ShiftSchedule,
): PersonalShiftContext {
  const analysis = analyzeShiftCounterparts(target, allEvents, schedule);
  return {
    date: target.date,
    period: target.period,
    role: target.role,
    coverageStatus: analysis.coverageStatus,
    missingIntervals: analysis.missingIntervals,
    primaryCounterparts: analysis.primaryCounterparts.map(toCounterpart),
    shadowCounterparts: analysis.shadowCounterparts.map(toCounterpart),
  };
}

function toIssueTargetSummary(event: Event): PersonalIssueTargetSummary {
  return {
    date: event.date,
    category: event.category,
    title: event.title,
    role: event.role,
    period: event.period,
  };
}

function toPersonalIssue(issue: OperationalIssue): PersonalIssue {
  return {
    reason: issue.reason,
    severity: issue.severity,
    date: issue.date,
    missingIntervals: issue.missingIntervals,
    metadata: issue.metadata,
    targetEvent: issue.targetEvent ? toIssueTargetSummary(issue.targetEvent) : null,
  };
}

function toDutyBlockView(block: DutyBlock): PersonalDutyBlock {
  return {
    dutyFamily: block.dutyFamily,
    slot: block.slot,
    startDate: block.startDate,
    endDate: block.endDate,
    dates: block.dates,
    certainty: block.certainty,
    dayCount: block.dayCount,
    weekendCompleteness: block.weekendCompleteness,
  };
}

function toDutyActionView(action: DerivedDutyAction): PersonalDutyAction {
  return {
    type: action.type,
    date: action.date,
    localTime: action.localTime,
    dutyFamily: action.dutyBlock.dutyFamily,
    slot: action.dutyBlock.slot,
  };
}
