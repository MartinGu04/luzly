import type { Event, EventPeriod, EventRole } from "./event";
import {
  resolveEventShiftInterval,
  type MinuteInterval,
  type ShiftIntervalResolution,
  type ShiftSchedule,
} from "./shiftSchedule";

export type CoverageStatus = "full" | "partial" | "missing" | "not_evaluable";

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
  /** Gaps within the target interval not covered by any primary counterpart. */
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
  const coverageStatus: CoverageStatus =
    missingIntervals.length === 0 ? "full" : coveredIntervals.length === 0 ? "missing" : "partial";

  return {
    target,
    counterpartRole,
    primaryCounterparts,
    shadowCounterparts,
    targetIntervalResolution,
    targetInterval,
    coveredIntervals,
    missingIntervals,
    coverageStatus,
  };
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

export interface UnitShiftCoverageAnalysis {
  coverageStatus: CoverageStatus;
  /** Times within the canonical shift window where at least one required role (technician or supervisor) isn't covered. Empty unless status is "partial"/"missing". */
  missingIntervals: MinuteInterval[];
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

  const resolutions = roleEvents.map((event) => resolveEventShiftInterval(event, schedule));
  const resolvedIntervals = resolutions
    .filter(isResolved)
    .map((resolution) => clipInterval(resolution.interval, canonical))
    .filter(isInterval);

  const covered = mergeIntervals(resolvedIntervals);
  const missing = computeMissingIntervals(canonical, covered);

  const hasUnresolved = resolutions.some(
    (resolution) => resolution.status === "invalid" || resolution.status === "not_evaluable",
  );
  const ambiguous = hasUnresolved && missing.length > 0;

  return { covered, missing, ambiguous };
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
 * interval and merges them. The group is `"full"` only when BOTH roles
 * structurally cover the entire canonical window. If either role has NO
 * coverage at all, the group is `"missing"` — even if the other role is
 * fully covered. Otherwise, any gap in either role makes the group
 * `"partial"`, with `missingIntervals` being the merged union of both
 * roles' own gaps (a time is "missing" for the group if EITHER required
 * role isn't covered there). An unresolved/invalid Event never fabricates
 * a "missing" gap where the truth is unknown — that role (and therefore
 * the whole group) becomes `"not_evaluable"` instead, UNLESS resolved
 * coverage alone already proves that role's canonical window is fully
 * covered (an extra unresolved duplicate Event never invalidates an
 * already-provably-full result).
 */
export function analyzeUnitShiftCoverage(
  period: EventPeriod,
  groupEvents: readonly Event[],
  schedule: ShiftSchedule,
): UnitShiftCoverageAnalysis {
  const canonical = canonicalWindowForPeriod(period, schedule);
  if (!canonical) {
    return { coverageStatus: "not_evaluable", missingIntervals: [] };
  }

  const technician = analyzeRoleCoverage("technician", groupEvents, schedule, canonical);
  const supervisor = analyzeRoleCoverage("supervisor", groupEvents, schedule, canonical);

  if (technician.ambiguous || supervisor.ambiguous) {
    return { coverageStatus: "not_evaluable", missingIntervals: [] };
  }

  const missingIntervals = mergeIntervals([...technician.missing, ...supervisor.missing]);
  const coverageStatus: CoverageStatus =
    missingIntervals.length === 0
      ? "full"
      : technician.covered.length === 0 || supervisor.covered.length === 0
        ? "missing"
        : "partial";

  return { coverageStatus, missingIntervals };
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
