import type { ShiftFairnessPersonRowView } from "@/lib/readModels/shiftFairnessTypes";

/**
 * PR #51 follow-up -- Shift Fairness ONLY: a purely PRESENTATION filter
 * that hides a row with genuinely nothing to show for the selected month
 * (no performed work, no modeled expected work at all), e.g. a permanent-
 * personnel row that simply didn't participate in Shift rotation that
 * month. This never touches the Fairness calculation itself -- the row
 * still exists in `model`/the comparison group, it's only omitted from the
 * rendered card list.
 *
 * A row is hidden ONLY when EVERY one of these holds:
 *  - `actualShifts === 0` (no performed work at all)
 *  - `target === 0` (an explicit, KNOWN zero target -- not `null`; a
 *    `null` target means "unknown", and unknown is never treated as zero,
 *    per the safeguard below)
 *  - `weekendActualShifts === 0` (no weekend work either)
 *  - `weekendTarget` is `0` or `null` (no meaningful weekend expectation)
 *
 * Safeguards this deliberately preserves:
 *  - `actualShifts === 0` with a positive `target` -> stays visible (a
 *    real gap, not a non-participant).
 *  - any `actualShifts > 0` -> always stays visible (real confirmed work).
 *  - `target === null` -> never hidden merely because `actualShifts` is
 *    0 -- an unmodelable target is not the same thing as a zero target.
 */
export function isShiftFairnessRowVisible(row: ShiftFairnessPersonRowView): boolean {
  const hasNoActualWork = row.actualShifts === 0 && row.weekendActualShifts === 0;
  const hasNoMeaningfulTarget = row.target === 0 && (row.weekendTarget === 0 || row.weekendTarget === null);
  return !(hasNoActualWork && hasNoMeaningfulTarget);
}
