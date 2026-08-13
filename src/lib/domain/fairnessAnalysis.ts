import type { FairnessPersonRow, FairnessTargets, FairnessTotalsRow } from "./fairnessTable";

export type FairnessAllocationRole = "supervisor" | "technician";

/**
 * The ONLY verified deterministic allocation-label -> target-role mapping
 * (PR #15 §14). Every other allocation label (ר"צ, הסמכה, משתחרר, ...) gets
 * no target -- never an invented one -- unless a future deterministic
 * domain/personnel rule proves one.
 */
const ALLOCATION_ROLE_BY_LABEL: Readonly<Record<string, FairnessAllocationRole>> = {
  טכנאי: "technician",
  'אחמ"ש': "supervisor",
};

export function resolveFairnessAllocationRole(allocationLabel: string): FairnessAllocationRole | null {
  return ALLOCATION_ROLE_BY_LABEL[allocationLabel] ?? null;
}

/**
 * "יעד השוואה" for one row -- `null` unless the allocation label has a
 * deterministic target role AND that role's period target is itself known
 * (PR #15 §12-15). This is a reference for comparison, never a hard limit.
 */
export function resolveComparisonTarget(allocationLabel: string, targets: FairnessTargets): number | null {
  const role = resolveFairnessAllocationRole(allocationLabel);
  if (role === null) return null;
  return role === "supervisor" ? targets.supervisorTarget : targets.technicianTarget;
}

/**
 * current - previous, only when both scores are known (PR #15 §11). A
 * missing previous score is NEVER treated as zero -- the caller must show
 * "חדש / אין ניקוד קודם" instead of a fabricated delta.
 */
export function computeScoreDelta(previousScore: number | null, currentScore: number | null): number | null {
  if (previousScore === null || currentScore === null) return null;
  return currentScore - previousScore;
}

/** currentScore - comparisonTarget -- context only, never presented as a violation (PR #15 §15). */
export function computeGapToTarget(currentScore: number | null, comparisonTarget: number | null): number | null {
  if (currentScore === null || comparisonTarget === null) return null;
  return currentScore - comparisonTarget;
}

/**
 * currentScore / comparisonTarget -- lets the manager compare people across
 * different target scales (PR #15 §21). `null` whenever either side is
 * missing or the target isn't a usable positive number -- never a division
 * by zero, never a guess.
 */
export function computeNormalizedLoad(currentScore: number | null, comparisonTarget: number | null): number | null {
  if (currentScore === null || comparisonTarget === null) return null;
  if (comparisonTarget <= 0) return null;
  return currentScore / comparisonTarget;
}

export interface FairnessTotalsValidation {
  computedPreviousTotal: number;
  computedCurrentTotal: number;
  computedWeekendTotal: number;
  previousMismatch: boolean;
  currentMismatch: boolean;
  weekendMismatch: boolean;
  hasDiscrepancy: boolean;
}

/** Small decimal tolerance -- the sheet's own rounding must never trip a false discrepancy warning. */
const DECIMAL_TOLERANCE = 0.01;

function sumNonNull(values: readonly (number | null)[]): number {
  return values.reduce<number>((sum, value) => (value === null ? sum : sum + value), 0);
}

function mismatches(reported: number | null, computed: number): boolean {
  if (reported === null) return false;
  return Math.abs(reported - computed) > DECIMAL_TOLERANCE;
}

/**
 * Independently sums the numeric person rows and compares each sum against
 * the sheet's own "סך הכל:" row (PR #15 §23) -- informational only, this
 * NEVER "fixes" the sheet's reported total. `null`/"-" rows are naturally
 * excluded by `sumNonNull`. Never mutates its inputs.
 */
export function validateFairnessTotals(
  rows: readonly FairnessPersonRow[],
  totals: FairnessTotalsRow | null,
): FairnessTotalsValidation {
  const computedPreviousTotal = sumNonNull(rows.map((row) => row.previousScore));
  const computedCurrentTotal = sumNonNull(rows.map((row) => row.currentScore));
  const computedWeekendTotal = sumNonNull(rows.map((row) => row.weekendCount));

  const previousMismatch = mismatches(totals?.reportedPreviousTotal ?? null, computedPreviousTotal);
  const currentMismatch = mismatches(totals?.reportedCurrentTotal ?? null, computedCurrentTotal);
  const weekendMismatch = mismatches(totals?.reportedWeekendTotal ?? null, computedWeekendTotal);

  return {
    computedPreviousTotal,
    computedCurrentTotal,
    computedWeekendTotal,
    previousMismatch,
    currentMismatch,
    weekendMismatch,
    hasDiscrepancy: previousMismatch || currentMismatch || weekendMismatch,
  };
}
