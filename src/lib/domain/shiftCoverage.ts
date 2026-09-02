import type { Event, EventPeriod, EventRole } from "./event";
import {
  resolveEventShiftInterval,
  type MinuteInterval,
  type ShiftIntervalResolution,
  type ShiftSchedule,
} from "./shiftSchedule";

export type CoverageStatus = "full" | "partial" | "missing" | "not_evaluable";

/** A shift is adequately supervisor-staffed on its own once this many distinct supervisors cover it -- see `hasMultiSupervisorStaffing`. */
const MULTI_SUPERVISOR_WAIVER_MIN_COUNT = 2;

/**
 * Product rule: two (or more) supervisors on the same shift are, by
 * themselves, sufficient staffing even with zero technicians -- a
 * technician-missing verdict is waived wherever this is true (see
 * `analyzeShiftCounterparts` and `analyzeUnitShiftCoverage`). Deliberately
 * NOT symmetric: no rule waives a missing SUPERVISOR just because there are
 * 2+ technicians -- that has never been defined as valid, so it stays
 * exactly as invalid as before.
 *
 * Counts DISTINCT people (by `personId`) among `events` with
 * `role === "supervisor"` and `shadow === false` -- a shadow/handover
 * supervisor is never counted toward this, matching every other coverage
 * computation in this domain. This is a staffing/headcount question (who is
 * actually assigned), not a re-run of the interval math above.
 */
export function hasMultiSupervisorStaffing(events: readonly Event[]): boolean {
  const supervisorPeople = new Set(
    events
      .filter((event) => event.category === "shift" && event.role === "supervisor" && !event.shadow)
      .map((event) => event.personId),
  );
  return supervisorPeople.size >= MULTI_SUPERVISOR_WAIVER_MIN_COUNT;
}

/**
 * "מי איתי?" — who else is on this shift, and does the opposite role fully
 * cover it. Structural coverage only: certainty (confirmed/tentative) is
 * preserved on the returned Events untouched, never used to decide
 * coverage here. Whether a tentative Event should count as operationally
 * confirmed coverage is a decision for a future rules engine, not this one.
 */
export interface ShiftCounterpartAnalysis {
  target: Event;
  /** The opposite role being searched for; null when the target has no role to oppose. */
  counterpartRole: EventRole;
  /** Same-date, same-period, opposite-role shift Events with shadow === false. */
  primaryCounterparts: Event[];
  /** Same-date, same-period, opposite-role shift Events with shadow === true — never counted as coverage. */
  shadowCounterparts: Event[];
  /** How the target's own effective interval resolved — carries the reason when coverage isn't evaluable. */
  targetIntervalResolution: ShiftIntervalResolution;
  targetInterval: MinuteInterval | null;
  /** Merged, clipped-to-target intervals actually covered by primary counterparts. */
  coveredIntervals: MinuteInterval[];
  /**
   * Gaps within the target interval not covered by any primary counterpart
   * -- always empty once the multi-supervisor staffing waiver applies (see
   * `hasMultiSupervisorStaffing`), even though `primaryCounterparts` itself
   * still honestly reports zero counterparts; only the VERDICT is waived,
   * never the underlying structural fact.
   */
  missingIntervals: MinuteInterval[];
  coverageStatus: CoverageStatus;
}

/**
 * Finds the opposite-role shift Events for `target` on the same date and
 * finds whether they structurally cover its effective interval.
 *
 * Matching rule (covers every case the domain cares about with one
 * equality check): a candidate must have the same `date`, the opposite
 * `role`, and the identical `period` as the target — day only pairs with
 * day, night only with night, and "unspecified" only with another
 * "unspecified" (never treated as a stand-in for a specific day/night
 * shift, and never guessed).
 *
 * Non-shift Events (duty/absence/constraint/status/context/change_note/
 * other/unknown) are safely rejected: not_evaluable, no counterparts.
 */
export function analyzeShiftCounterparts(
  target: Event,
  events: readonly Event[],
  schedule: ShiftSchedule,
): ShiftCounterpartAnalysis {
  const counterpartRole = oppositeRole(target.role);
  const targetIntervalResolution = resolveEventShiftInterval(target, schedule);

  if (target.category !== "shift" || counterpartRole === null) {
    return {
      target,
      counterpartRole,
      primaryCounterparts: [],
      shadowCounterparts: [],
      targetIntervalResolution,
      targetInterval: null,
      coveredIntervals: [],
      missingIntervals: [],
      coverageStatus: "not_evaluable",
    };
  }

  const candidates = events.filter(
    (event) =>
      event.category === "shift" &&
      event.date === target.date &&
      event.role === counterpartRole &&
      event.period === target.period,
  );
  const primaryCounterparts = candidates.filter((event) => !event.shadow);
  const shadowCounterparts = candidates.filter((event) => event.shadow);

  if (targetIntervalResolution.status !== "resolved") {
    return {
      target,
      counterpartRole,
      primaryCounterparts,
      shadowCounterparts,
      targetIntervalResolution,
      targetInterval: null,
      coveredIntervals: [],
      missingIntervals: [],
      coverageStatus: "not_evaluable",
    };
  }

  const targetInterval = targetIntervalResolution.interval;

  const clippedPrimaryIntervals = primaryCounterparts
    .map((event) => resolveEventShiftInterval(event, schedule))
    .filter(isResolved)
    .map((resolution) => clipInterval(resolution.interval, targetInterval))
    .filter(isInterval);

  const coveredIntervals = mergeIntervals(clippedPrimaryIntervals);
  const missingIntervals = computeMissingIntervals(targetInterval, coveredIntervals);
  let coverageStatus: CoverageStatus =
    missingIntervals.length === 0 ? "full" : coveredIntervals.length === 0 ? "missing" : "partial";
  let effectiveMissingIntervals = missingIntervals;

  // The multi-supervisor staffing waiver (see `hasMultiSupervisorStaffing`)
  // only ever applies from a SUPERVISOR target's own perspective (its
  // counterpart role is technician) against a fully-missing technician
  // counterpart -- never a partial gap, and never the reverse direction.
  if (
    coverageStatus === "missing" &&
    target.role === "supervisor" &&
    hasMultiSupervisorStaffing(
      events.filter((event) => event.date === target.date && event.period === target.period),
    )
  ) {
    coverageStatus = "full";
    effectiveMissingIntervals = [];
  }

  return {
    target,
    counterpartRole,
    primaryCounterparts,
    shadowCounterparts,
    targetIntervalResolution,
    targetInterval,
    coveredIntervals,
    missingIntervals: effectiveMissingIntervals,
    coverageStatus,
  };
}

/**
 * "who else is actually on this shift with me?" -- roster/companionship
 * context, deliberately SEPARATE from the coverage-validity question
 * `analyzeShiftCounterparts` answers. Every OTHER person's shift Event
 * sharing the same `date`+`period` as `target`, ANY role (same-role
 * coworkers included -- e.g. two supervisors on the same shift), always
 * excluding every one of the target's OWN Events (by `personId`, so a
 * split-shift target with two of its own Events never lists itself).
 * `role` is preserved on every returned Event so the UI can label who's
 * טכנאי vs. אחמ״ש.
 *
 * This is never itself a coverage/adequacy signal -- who's on the roster
 * says nothing about whether staffing is acceptable (see
 * `analyzeShiftCounterparts.coverageStatus` /
 * `analyzeUnitShiftCoverage.coverageStatus` for that separate question,
 * including the multi-supervisor staffing waiver). A person appearing
 * more than once (e.g. a genuine split-shift colleague with two Events)
 * is never deduplicated away here -- each distinct Event is a real
 * structural fact; the read-model projection layer decides how to present
 * that as one row per person.
 */
export interface ShiftRosterAnalysis {
  target: Event;
  /** Every other person's same-date/same-period shift Event, any role, shadow === false. */
  primaryRoster: Event[];
  /** Same, but shadow === true -- never counted as primary coverage, still shown separately. */
  shadowRoster: Event[];
}

export function buildShiftRoster(target: Event, events: readonly Event[]): ShiftRosterAnalysis {
  if (target.category !== "shift") {
    return { target, primaryRoster: [], shadowRoster: [] };
  }

  const candidates = events.filter(
    (event) =>
      event.category === "shift" &&
      event.date === target.date &&
      event.period === target.period &&
      event.personId !== target.personId,
  );

  return {
    target,
    primaryRoster: candidates.filter((event) => !event.shadow),
    shadowRoster: candidates.filter((event) => event.shadow),
  };
}

/**
 * Every shift Event for an arbitrary `(date, period)` group -- no target
 * person required, unlike `buildShiftRoster`. This is the primitive for
 * "who's on shift X" when there is no "me" to exclude (e.g. resolving the
 * staffing of an adjacent shift for מי לפניי / מי אחריי). Mirrors the same
 * grouping `managerEventProjections.ts`'s `buildShiftStaffingOverview`
 * already uses (`category === "shift" && date === date && period === period`),
 * kept here alongside `buildShiftRoster` since both answer "who's on this
 * shift" -- just with vs. without a target to exclude.
 */
export function findShiftGroupEvents(events: readonly Event[], date: string, period: EventPeriod): Event[] {
  return events.filter((event) => event.category === "shift" && event.date === date && event.period === period);
}

function oppositeRole(role: EventRole): EventRole {
  if (role === "supervisor") return "technician";
  if (role === "technician") return "supervisor";
  return null;
}

function isResolved(
  resolution: ShiftIntervalResolution,
): resolution is Extract<ShiftIntervalResolution, { status: "resolved" }> {
  return resolution.status === "resolved";
}

function isInterval(interval: MinuteInterval | null): interval is MinuteInterval {
  return interval !== null;
}

// ---------------------------------------------------------------------------
// Unit-wide group coverage (manager overview) — independent of any single
// person's identity/ordering, unlike `analyzeShiftCounterparts` above.
// ---------------------------------------------------------------------------

/**
 * Per-role coverage diagnostic, derived from the SAME `RoleCoverageResult`
 * the overall group verdict below is built from -- never a second,
 * independent coverage algorithm, and never guessed from presentation
 * data (e.g. "is the rendered name list empty?"). See
 * `toRoleCoverageDiagnostic` for the exact status derivation rule.
 */
export interface RoleCoverageDiagnostic {
  status: CoverageStatus;
  /** Empty unless `status === "partial"` or `"missing"` -- a `"not_evaluable"` role never fabricates a gap it can't honestly prove. */
  missingIntervals: MinuteInterval[];
}

export interface UnitShiftCoverageAnalysis {
  coverageStatus: CoverageStatus;
  /** Times within the canonical shift window where at least one required role (technician or supervisor) isn't covered. Empty unless status is "partial"/"missing". */
  missingIntervals: MinuteInterval[];
  /**
   * Independent per-role diagnostics -- lets a caller say "חסר טכנאי" vs.
   * "חסר אחמ״ש" explicitly, rather than inferring the missing role from
   * an empty rendered name list. Set in every branch (including the
   * "provably missing"/"not_evaluable" overall-status shortcuts), so a
   * role's own true status is never hidden behind the group's headline
   * verdict.
   */
  roleCoverage: {
    technician: RoleCoverageDiagnostic;
    supervisor: RoleCoverageDiagnostic;
  };
}

function canonicalWindowForPeriod(period: EventPeriod, schedule: ShiftSchedule): MinuteInterval | null {
  if (period === "day") return { startMinute: schedule.dayStartMinute, endMinute: schedule.dayEndMinute };
  if (period === "night") return { startMinute: schedule.nightStartMinute, endMinute: schedule.nightEndMinute };
  return null;
}

interface RoleCoverageResult {
  covered: MinuteInterval[];
  missing: MinuteInterval[];
  /** True when this role's true coverage can't be honestly determined (an unresolved/invalid Event exists AND resolved coverage alone doesn't already prove the canonical window is fully covered). */
  ambiguous: boolean;
}

/**
 * A GENERIC role assignment -- `role` set, but `period: "unspecified"`
 * (e.g. a weekend schedule cell that just says `אחמ"ש`, with no יום/לילה
 * split) -- covers the role's ENTIRE canonical window for `canonical`'s
 * period, by domain rule: one such assignment satisfies both the day AND
 * the night requirement for its date, without ever being converted/
 * normalized into a day- or night-specific Event (see this function's own
 * caller, `analyzeRoleCoverage`, and `managerEventProjections.ts`'s
 * `buildShiftStaffingOverview`, which is what actually feeds the SAME
 * generic Event into both the day and the night group's `groupEvents` in
 * the first place -- this function only decides how one such Event
 * resolves once it's already in the group being evaluated). Deliberately
 * ignores `startTimeOverride`/`endTimeOverride` -- a truly generic,
 * period-less assignment has no partial-time concept to apply against
 * (the parser, `lib/parsers/event.ts`, never produces a time override on
 * a period-less shift phrase either).
 */
function isGenericRoleEvent(event: Event): boolean {
  return event.period === "unspecified";
}

function analyzeRoleCoverage(
  role: EventRole,
  groupEvents: readonly Event[],
  schedule: ShiftSchedule,
  canonical: MinuteInterval,
): RoleCoverageResult {
  const roleEvents = groupEvents.filter((event) => event.role === role && !event.shadow);

  if (roleEvents.length === 0) {
    return { covered: [], missing: [canonical], ambiguous: false };
  }

  const genericIntervals = roleEvents.some(isGenericRoleEvent) ? [canonical] : [];

  const dayNightEvents = roleEvents.filter((event) => !isGenericRoleEvent(event));
  const resolutions = dayNightEvents.map((event) => resolveEventShiftInterval(event, schedule));
  const resolvedIntervals = resolutions
    .filter(isResolved)
    .map((resolution) => clipInterval(resolution.interval, canonical))
    .filter(isInterval);

  const covered = mergeIntervals([...genericIntervals, ...resolvedIntervals]);
  const missing = computeMissingIntervals(canonical, covered);

  const hasUnresolved = resolutions.some(
    (resolution) => resolution.status === "invalid" || resolution.status === "not_evaluable",
  );
  const ambiguous = hasUnresolved && missing.length > 0;

  return { covered, missing, ambiguous };
}

/**
 * A role is PROVABLY zero coverage only when it has no resolved coverage
 * AND its own result isn't ambiguous -- i.e. it has no non-shadow Events
 * for this role at all. A role whose only Event(s) are unresolved/invalid
 * is NOT provably zero (it's `ambiguous` instead) -- there's a real Event
 * that might have covered this role, we just can't tell.
 */
function isProvablyZeroCoverage(role: RoleCoverageResult): boolean {
  return role.covered.length === 0 && !role.ambiguous;
}

/**
 * Role-level status, derived from the SAME `RoleCoverageResult` fields the
 * overall group verdict uses -- never a re-derived/independent judgment:
 * - `ambiguous` -> `"not_evaluable"` (an unresolved/invalid Event means
 *   this role's true coverage genuinely can't be proven -- never
 *   fabricate a gap or a false "full").
 * - no gaps (`missing.length === 0`) -> `"full"`.
 * - zero resolved coverage (`covered.length === 0`, and not ambiguous --
 *   i.e. this role has no non-shadow Events at all) -> `"missing"`.
 * - otherwise -> `"partial"`.
 *
 * A `"not_evaluable"` role never exposes `missingIntervals` -- exposing a
 * gap there would imply more certainty than the domain actually has.
 */
function toRoleCoverageDiagnostic(role: RoleCoverageResult): RoleCoverageDiagnostic {
  if (role.ambiguous) return { status: "not_evaluable", missingIntervals: [] };
  if (role.missing.length === 0) return { status: "full", missingIntervals: [] };
  if (role.covered.length === 0) return { status: "missing", missingIntervals: role.missing };
  return { status: "partial", missingIntervals: role.missing };
}

/**
 * Unit-wide coverage for one date+period GROUP (every shift Event that
 * date/period, any person, any role) — independent of `personId`/
 * `sourceCell` ordering or which person happens to sort first, unlike
 * naively reusing `analyzeShiftCounterparts` with an arbitrarily-chosen
 * target Event.
 *
 * Evaluates the canonical full shift window from `ShiftSchedule` (day:
 * `dayStartMinute`→`dayEndMinute`; night: `nightStartMinute`→
 * `nightEndMinute`; any other period has no canonical window →
 * `not_evaluable`). For EACH primary role separately (technicians,
 * supervisors — shadow Events are always excluded from coverage, per the
 * rest of this domain), resolves every non-shadow Event's effective
 * interval and merges them.
 *
 * PRECEDENCE (checked in this order):
 * 1. The multi-supervisor staffing waiver (`hasMultiSupervisorStaffing`):
 *    if technician coverage is provably zero BUT supervisor coverage is
 *    clean (fully resolved, no gap, not ambiguous) AND 2+ distinct
 *    supervisors are staffing the shift, the group is treated as if
 *    technician coverage were `"full"` -- this is a deliberate product
 *    rule (two supervisors alone are sufficient staffing), never a second
 *    coverage algorithm. Never the reverse direction (a missing supervisor
 *    is never waived by extra technicians).
 * 2. Otherwise, if EITHER role is provably zero coverage
 *    (`isProvablyZeroCoverage` — no non-shadow Events for that role at
 *    all, i.e. genuinely absent, not merely unresolved), the group is
 *    definitely `"missing"` — even if the OTHER role is ambiguous,
 *    partially covered, or even fully covered. `missingIntervals` is the
 *    ENTIRE canonical window in this case (a narrower gap in the other,
 *    structurally irrelevant role would understate how incomplete the
 *    group actually is). Proven absence always beats uncertainty or
 *    partial coverage elsewhere.
 * 3. Otherwise, if either role is `ambiguous` (it has an Event, but at
 *    least one is unresolved/invalid AND resolved coverage alone doesn't
 *    already prove that role's window is fully covered), the group is
 *    `"not_evaluable"` — an unresolved/invalid Event never fabricates a
 *    "missing" gap where the truth is genuinely unknown. An extra
 *    unresolved duplicate Event never invalidates an already-provably-full
 *    result for that role, though (see `analyzeRoleCoverage`).
 * 4. Otherwise both roles are cleanly resolved (possibly with gaps): the
 *    group is `"full"` only when BOTH roles structurally cover the entire
 *    canonical window; otherwise `"partial"`, with `missingIntervals`
 *    being the merged union of both roles' own gaps (a time is "missing"
 *    for the group if EITHER required role isn't covered there) -- the
 *    waived technician gap (step 1) never contributes to this union.
 */
export function analyzeUnitShiftCoverage(
  period: EventPeriod,
  groupEvents: readonly Event[],
  schedule: ShiftSchedule,
): UnitShiftCoverageAnalysis {
  const canonical = canonicalWindowForPeriod(period, schedule);
  if (!canonical) {
    const notEvaluable: RoleCoverageDiagnostic = { status: "not_evaluable", missingIntervals: [] };
    return {
      coverageStatus: "not_evaluable",
      missingIntervals: [],
      roleCoverage: { technician: notEvaluable, supervisor: notEvaluable },
    };
  }

  const technician = analyzeRoleCoverage("technician", groupEvents, schedule, canonical);
  const supervisor = analyzeRoleCoverage("supervisor", groupEvents, schedule, canonical);

  const technicianWaived =
    isProvablyZeroCoverage(technician) &&
    !supervisor.ambiguous &&
    supervisor.missing.length === 0 &&
    hasMultiSupervisorStaffing(groupEvents);

  const roleCoverage = {
    technician: technicianWaived
      ? ({ status: "full", missingIntervals: [] } satisfies RoleCoverageDiagnostic)
      : toRoleCoverageDiagnostic(technician),
    supervisor: toRoleCoverageDiagnostic(supervisor),
  };

  // A provably-absent required role makes the group definitely "missing",
  // regardless of whether the OTHER role is ambiguous (or even fully
  // covered) -- proven absence always takes precedence over uncertainty
  // elsewhere. The group's missingIntervals are the entire canonical
  // window in this case: a partial gap in the other (irrelevant) role
  // would understate how incomplete the group actually is. Per-role
  // diagnostics still reflect each role's OWN true status, independent of
  // this overall shortcut. Skipped entirely once the waiver above applies.
  if (!technicianWaived && (isProvablyZeroCoverage(technician) || isProvablyZeroCoverage(supervisor))) {
    return { coverageStatus: "missing", missingIntervals: [canonical], roleCoverage };
  }

  if (technician.ambiguous || supervisor.ambiguous) {
    return { coverageStatus: "not_evaluable", missingIntervals: [], roleCoverage };
  }

  const missingIntervals = mergeIntervals([
    ...(technicianWaived ? [] : technician.missing),
    ...supervisor.missing,
  ]);
  const coverageStatus: CoverageStatus = missingIntervals.length === 0 ? "full" : "partial";

  return { coverageStatus, missingIntervals, roleCoverage };
}

// ---------------------------------------------------------------------------
// Interval math (pure, exported for direct unit testing)
// ---------------------------------------------------------------------------

/** Clips `interval` to `bounds`; null if there's no overlap at all. */
export function clipInterval(interval: MinuteInterval, bounds: MinuteInterval): MinuteInterval | null {
  const startMinute = Math.max(interval.startMinute, bounds.startMinute);
  const endMinute = Math.min(interval.endMinute, bounds.endMinute);
  if (startMinute >= endMinute) return null;
  return { startMinute, endMinute };
}

/**
 * Sorts and merges overlapping AND touching intervals (a shift ending
 * exactly when the next one starts has no gap).
 */
export function mergeIntervals(intervals: readonly MinuteInterval[]): MinuteInterval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute);
  const merged: MinuteInterval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, current.endMinute);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/** `covered` must already be sorted and merged (as returned by mergeIntervals). */
export function computeMissingIntervals(
  target: MinuteInterval,
  covered: readonly MinuteInterval[],
): MinuteInterval[] {
  const missing: MinuteInterval[] = [];
  let cursor = target.startMinute;

  for (const interval of covered) {
    if (interval.startMinute > cursor) {
      missing.push({ startMinute: cursor, endMinute: Math.min(interval.startMinute, target.endMinute) });
    }
    cursor = Math.max(cursor, interval.endMinute);
    if (cursor >= target.endMinute) break;
  }

  if (cursor < target.endMinute) {
    missing.push({ startMinute: cursor, endMinute: target.endMinute });
  }

  return missing;
}
