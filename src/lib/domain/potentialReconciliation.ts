import type { Event } from "./event";
import { BLOCKING_ABSENCE_KINDS } from "./operationalIssues";

/**
 * covered/partial are kept as real, forward-compatible statuses (this
 * function does not produce them yet -- see the module doc comment) so a
 * future PR that adds a real Potential column -> duty/requirement-family
 * mapping doesn't need a breaking type change, the same way
 * `IssueSeverity`'s "info" stayed forward-compatible before any rule
 * produced it.
 */
export type ManagerRequirementStatus = "covered" | "partial" | "missing" | "not_evaluable";

/** The minimal shape this domain needs from a `PotentialAllocation` -- decoupled from the parser's exact type. */
export interface ReconcilableAllocation {
  date: string;
  columnLabel: string;
  rawValue: string;
  resolvedPersonId: string | null;
}

export interface ManagerRequirementReconciliation {
  date: string;
  columnLabel: string;
  /** The Potential cell's own honest text -- a person's name, or an organizational/source label. Never reinterpreted. */
  sourceRawValue: string;
  resolvedPersonId: string | null;
  status: ManagerRequirementStatus;
  /**
   * True only for the one deterministic conflict this domain currently
   * detects: a NAMED-PERSON requirement whose target has a blocking
   * absence internally on the same date (identity via the personnel
   * roster join established in the parser -- never text similarity).
   */
  namedPersonBlockingAbsence: boolean;
}

function hasBlockingAbsence(events: readonly Event[], personId: string, date: string): boolean {
  return events.some(
    (event) =>
      event.personId === personId &&
      event.date === date &&
      event.category === "absence" &&
      event.absenceKind !== null &&
      BLOCKING_ABSENCE_KINDS.has(event.absenceKind),
  );
}

/**
 * Reconciles ONE Potential allocation against the full internal `Event[]`.
 *
 * Deliberately conservative -- the real workbook's requirement-column ->
 * duty/requirement-family mapping is not known yet (see PR #14's report),
 * so "covered"/"partial" are never produced here today:
 *
 * - an ORGANIZATIONAL/SOURCE LABEL allocation (`resolvedPersonId === null`)
 *   is always "not_evaluable" -- there's no deterministic identity to check
 *   an internal schedule against, and this never fuzzy-matches raw text to
 *   guess one (PR #14 §12/§14).
 * - a NAMED-PERSON allocation whose target has a blocking absence
 *   internally that same date is "missing", with `namedPersonBlockingAbsence`
 *   set -- the one deterministic conflict PR #14 §15 explicitly sanctions.
 * - every other named-person allocation is ALSO "not_evaluable": they may
 *   well be fulfilling this exact requirement internally, but without a
 *   typed requirement/slot mapping this function cannot honestly claim
 *   "covered" -- that would be exactly the guesswork PR #14 forbids
 *   ("Never show 'מכוסה' based on guesswork").
 *
 * Pure: no network, no Date/UTC, never mutates its inputs.
 */
export function reconcilePotentialAllocation(
  allocation: ReconcilableAllocation,
  events: readonly Event[],
): ManagerRequirementReconciliation {
  if (allocation.resolvedPersonId === null) {
    return {
      date: allocation.date,
      columnLabel: allocation.columnLabel,
      sourceRawValue: allocation.rawValue,
      resolvedPersonId: null,
      status: "not_evaluable",
      namedPersonBlockingAbsence: false,
    };
  }

  const blocked = hasBlockingAbsence(events, allocation.resolvedPersonId, allocation.date);

  return {
    date: allocation.date,
    columnLabel: allocation.columnLabel,
    sourceRawValue: allocation.rawValue,
    resolvedPersonId: allocation.resolvedPersonId,
    status: blocked ? "missing" : "not_evaluable",
    namedPersonBlockingAbsence: blocked,
  };
}

/** Reconciles every allocation, preserving input order (already deterministic from the parser). */
export function reconcilePotentialAllocations(
  allocations: readonly ReconcilableAllocation[],
  events: readonly Event[],
): ManagerRequirementReconciliation[] {
  return allocations.map((allocation) => reconcilePotentialAllocation(allocation, events));
}
