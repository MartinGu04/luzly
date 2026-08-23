import type { FairnessStatus } from "@/lib/domain/fairnessFoundation";

/**
 * The shared below/balanced/above vocabulary in Hebrew (PR #4) -- used
 * identically for Shift and Duty Fairness, since both now share the same
 * `FairnessStatus` type (`fairnessFoundation.ts`). A `null` status is
 * deliberately NOT a fourth verdict -- it means the comparison itself
 * could not honestly be produced.
 *
 * The `null` label is deliberately GENERIC ("לא ניתן להשוות") rather than
 * naming a specific missing piece: `status === null` can happen because
 * `comparisonTarget` is unavailable, OR because `currentScore`/`actual`
 * is unavailable, OR both -- this function has no way to know which, and
 * guessing would risk a false claim (e.g. a Duty row with a real, known
 * `comparisonTarget` but an unavailable `currentScore` would show
 * "יעד 8" right next to a null-status label claiming the target itself
 * couldn't be calculated -- contradictory). A caller that DOES know which
 * specific piece is missing (e.g. Shift's own `unavailableNote` when
 * `target === null`) renders that explanation separately, alongside this
 * generic badge -- never inferred from `status === null` alone here.
 */
export function fairnessStatusLabel(status: FairnessStatus | null): string {
  if (status === "below") return "מתחת ליעד";
  if (status === "balanced") return "מאוזן";
  if (status === "above") return "מעל היעד";
  return "לא ניתן להשוות";
}

/**
 * Shift Fairness's OWN short badge vocabulary -- deliberately a separate
 * function from `fairnessStatusLabel` above, never a shared rename of it.
 * Shift Fairness's comparison value is the person's ADJUSTED EXPECTATION UP
 * TO TODAY (`fairnessShiftEngine.ts`'s opportunity-share `target`), not a
 * fixed monthly quota -- so its badge must say "above/below EXPECTED"
 * (matching the exact wording `formatFairnessDeviationState` already uses
 * for the card's own "מצב מול הצפי" row), never "above/below TARGET" (a real
 * user was confused reading "above target" next to a number that isn't a
 * target at all). `fairnessStatusLabel` keeps its own "יעד" vocabulary
 * unchanged for Duty Fairness, where `comparisonTarget` genuinely IS a
 * fixed published target -- this split is what keeps both surfaces honest
 * about which of the two concepts they're actually showing.
 */
export function fairnessShiftStatusLabel(status: FairnessStatus | null): string {
  if (status === "below") return "מתחת לצפוי";
  if (status === "balanced") return "מאוזן";
  if (status === "above") return "מעל הצפוי";
  return "לא ניתן להשוות";
}
