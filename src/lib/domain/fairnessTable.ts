/**
 * One data row from a Potential sheet's separate Fairness table ("טבלת
 * צדק") -- NOT a `PotentialAllocation`. Potential (operational
 * requirements) and Fairness (score/allocation history) are separate
 * domains that happen to live on the same sheet tabs (PR #15 §6).
 *
 * `resolvedPersonId` is set ONLY when `sourceName` (whitespace-normalized)
 * matches EXACTLY ONE personnel record -- zero or duplicate matches both
 * resolve to `null`, never an arbitrary pick, never fuzzy matching (same
 * convention as `PotentialAllocation.resolvedSourcePersonId`). An
 * unresolved row is still real data and must still display.
 *
 * `allocationLabel` is raw source data (e.g. "טכנאי", 'אחמ"ש', "ר\"צ") --
 * never a basis for inventing a capability.
 *
 * Scores/weekend count are `number | null` -- the sheet's own "-" marker
 * means unavailable/not-applicable and must NEVER be silently read as 0.
 */
export interface FairnessPersonRow {
  sourceName: string;
  resolvedPersonId: string | null;
  allocationLabel: string;
  previousScore: number | null;
  currentScore: number | null;
  weekendCount: number | null;
  /** Raw exemption labels, comma-split and trimmed, exactly as written -- never discarded, never fuzzy-mapped here (see `lib/domain/fairnessExemptions.ts`). */
  exemptions: readonly string[];
  sourceSheet: string;
  sourceCell: string;
}

/** The fairness table's own "סך הכל:" row, parsed separately from the person rows it summarizes (PR #15 §23). */
export interface FairnessTotalsRow {
  reportedPreviousTotal: number | null;
  reportedCurrentTotal: number | null;
  reportedWeekendTotal: number | null;
  sourceSheet: string;
  sourceCell: string;
}

/**
 * The period-specific X/2X allocation targets parsed from the note below
 * the fairness table (PR #15 §12/§13). `X` is the supervisor target, `2X`
 * is the technician target -- these numbers CHANGE between periods and
 * must never be hard-coded. Either field is `null` when the note is
 * missing/malformed -- never a magic default.
 */
export interface FairnessTargets {
  supervisorTarget: number | null;
  technicianTarget: number | null;
}

/** The complete structural parse of one Potential sheet's Fairness table. */
export interface FairnessTableParseResult {
  personRows: readonly FairnessPersonRow[];
  /** `null` when no "סך הכל:" row was found. */
  totals: FairnessTotalsRow | null;
  targets: FairnessTargets;
}
