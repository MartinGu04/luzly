import type { AbsenceKind, Event } from "./event";
import { analyzeShiftCounterparts } from "./shiftCoverage";
import type { MinuteInterval, ShiftSchedule } from "./shiftSchedule";
import type { Person } from "./types";

export type IssueSeverity = "critical" | "review" | "info";

export type IssueReason =
  | "blocking_absence_with_assignment"
  | "shift_coverage_missing"
  | "shift_coverage_partial"
  | "invalid_shift_time"
  | "role_capability_mismatch";

export interface RoleCapabilityMismatchMetadata {
  requiredCapability: "isSupervisor" | "isTechnician";
}

/**
 * A deterministic, structural finding — never presentation. No colors, no
 * Hebrew UI copy, no alert/severity policy beyond the three severities
 * below. `events` keeps every Event that evidences the issue so a future
 * manager UI can explain exactly why it exists without re-deriving it.
 */
export interface OperationalIssue {
  reason: IssueReason;
  severity: IssueSeverity;
  personId: string;
  date: string;
  events: Event[];
  /** The single Event the issue is "about", when there is one canonical target. */
  targetEvent: Event | null;
  /** Only set for shift_coverage_missing/partial — the exact structural gaps. */
  missingIntervals: MinuteInterval[] | null;
  metadata: RoleCapabilityMismatchMetadata | null;
}

/**
 * Runs every operational rule over the full Event set and returns the
 * combined, deduplicated issue list. Pure: no React, no network, no Google
 * API, no env, no database, no mutation of any Event/Person passed in.
 */
export function detectOperationalIssues(
  events: readonly Event[],
  people: readonly Person[],
  schedule: ShiftSchedule,
): OperationalIssue[] {
  const peopleById = new Map(people.map((person) => [person.id, person]));

  const issues = [
    ...detectBlockingAbsenceIssues(events),
    ...detectShiftTimingIssues(events, schedule),
    ...detectCapabilityMismatchIssues(events, peopleById),
  ];

  return dedupeIssues(issues);
}

// ---------------------------------------------------------------------------
// Rule 1 — blocking absence + active assignment
// ---------------------------------------------------------------------------

/**
 * "after" (אפטר) is partial/ambiguous and deliberately excluded — it must
 * never be treated as a blocking full-day absence. Exported so the
 * presentation layer can reuse the exact same "does this absence block
 * the whole day" semantics (e.g. deciding whether to show a calm
 * vacation-day hero) without redefining it.
 */
export const BLOCKING_ABSENCE_KINDS: ReadonlySet<AbsenceKind> = new Set([
  "vacation",
  "abroad",
  "medical",
  "day_off",
]);

function isBlockingAbsence(event: Event): boolean {
  return (
    event.category === "absence" &&
    event.absenceKind !== null &&
    BLOCKING_ABSENCE_KINDS.has(event.absenceKind)
  );
}

/** Only an actual assignment (shift or duty) conflicts with a blocking absence — status/context/other/etc. don't. */
function isAssignmentEvent(event: Event): boolean {
  return event.category === "shift" || event.category === "duty";
}

/**
 * One person having several Events on a date is not inherently a conflict
 * (e.g. shift + oxid, shift + status, multiple duties are all fine). This
 * only fires when a blocking absence and a real assignment coexist for the
 * same person on the same date — one issue per (absence, assignment) pair,
 * so two different affected assignment Events stay distinguishable.
 */
export function detectBlockingAbsenceIssues(events: readonly Event[]): OperationalIssue[] {
  const issues: OperationalIssue[] = [];

  for (const group of groupByPersonAndDate(events).values()) {
    const absences = group.filter(isBlockingAbsence);
    if (absences.length === 0) continue;

    const assignments = group.filter(isAssignmentEvent);
    if (assignments.length === 0) continue;

    for (const absence of absences) {
      for (const assignment of assignments) {
        issues.push({
          reason: "blocking_absence_with_assignment",
          severity: "critical",
          personId: absence.personId,
          date: absence.date,
          events: [absence, assignment],
          targetEvent: assignment,
          missingIntervals: null,
          metadata: null,
        });
      }
    }
  }

  return issues;
}

function groupByPersonAndDate(events: readonly Event[]): Map<string, Event[]> {
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const key = `${event.personId} ${event.date}`;
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Rules 2 & 3 — shift coverage + invalid shift time
// ---------------------------------------------------------------------------

/**
 * Reuses `analyzeShiftCounterparts` for every shift Event as target — no
 * interval math is duplicated here. An invalid target shift time is
 * reported once as `invalid_shift_time` and never also produces a
 * fabricated missing-coverage issue for that same target. `not_evaluable`
 * (unspecified period) never produces a guessed coverage issue.
 */
export function detectShiftTimingIssues(
  events: readonly Event[],
  schedule: ShiftSchedule,
): OperationalIssue[] {
  const issues: OperationalIssue[] = [];

  for (const event of events) {
    if (event.category !== "shift") continue;

    const analysis = analyzeShiftCounterparts(event, events, schedule);
    const targetResolutionStatus = analysis.targetIntervalResolution.status;

    if (targetResolutionStatus === "invalid") {
      issues.push({
        reason: "invalid_shift_time",
        severity: "review",
        personId: event.personId,
        date: event.date,
        events: [event],
        targetEvent: event,
        missingIntervals: null,
        metadata: null,
      });
      continue;
    }

    if (targetResolutionStatus !== "resolved") continue; // not_evaluable — never guess day/night

    if (analysis.coverageStatus === "missing" || analysis.coverageStatus === "partial") {
      issues.push({
        reason:
          analysis.coverageStatus === "missing" ? "shift_coverage_missing" : "shift_coverage_partial",
        severity: "critical",
        personId: event.personId,
        date: event.date,
        events: [event, ...analysis.primaryCounterparts],
        targetEvent: event,
        missingIntervals: analysis.missingIntervals,
        metadata: null,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Rule 4 — personnel capability mismatch
// ---------------------------------------------------------------------------

/**
 * The scheduled role always comes from the Event (source of truth for the
 * actual assignment) — כ"א capabilities are only used here to flag a
 * mismatch for manager review, never to drive counterpart matching or
 * coverage. This is intentionally `review`, not `critical`: the personnel
 * capability map may simply be stale. Manager capability is irrelevant to
 * a shift-role mismatch.
 */
export function detectCapabilityMismatchIssues(
  events: readonly Event[],
  peopleById: ReadonlyMap<string, Person>,
): OperationalIssue[] {
  const issues: OperationalIssue[] = [];

  for (const event of events) {
    if (event.category !== "shift" || event.role === null) continue;

    const person = peopleById.get(event.personId);
    if (!person) continue;

    const requiredCapability =
      event.role === "supervisor" && !person.isSupervisor
        ? "isSupervisor"
        : event.role === "technician" && !person.isTechnician
          ? "isTechnician"
          : null;

    if (requiredCapability === null) continue;

    issues.push({
      reason: "role_capability_mismatch",
      severity: "review",
      personId: event.personId,
      date: event.date,
      events: [event],
      targetEvent: event,
      missingIntervals: null,
      metadata: { requiredCapability },
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Collapses issues built from identical evidence (e.g. the same Event
 * reference appearing twice in the input) while keeping genuinely
 * different affected Events distinguishable — the key is derived from each
 * evidence Event's structural origin (sheet + cell), not person/date/title.
 */
function dedupeIssues(issues: OperationalIssue[]): OperationalIssue[] {
  const seen = new Set<string>();
  const deduped: OperationalIssue[] = [];

  for (const issue of issues) {
    const key = buildIssueDedupeKey(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }

  return deduped;
}

function buildIssueDedupeKey(issue: OperationalIssue): string {
  const evidenceKey = issue.events.map((event) => `${event.sourceSheet}!${event.sourceCell}`).join(",");
  const missingKey = (issue.missingIntervals ?? [])
    .map((interval) => `${interval.startMinute}-${interval.endMinute}`)
    .join(",");
  return [issue.reason, issue.personId, issue.date, evidenceKey, missingKey].join("|");
}
