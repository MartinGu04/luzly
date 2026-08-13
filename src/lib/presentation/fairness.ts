import type { ManagerFairnessExemptionView } from "@/lib/readModels/managerFairnessTypes";

/** "6.35" stays as-is; "5.00" trims to "5"; "7.10" trims to "7.1". Never re-derives the value itself -- purely cosmetic. */
function trimmedNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/** Plain score/target display -- "—" for an unavailable ("-"/null) value, never a fabricated 0. */
export function formatFairnessScore(value: number | null): string {
  return value === null ? "—" : trimmedNumber(value);
}

export function formatFairnessWeekendCount(value: number | null): string {
  return value === null ? "—" : String(value);
}

/** "פער מהיעד" -- context, never framed as a violation regardless of sign. */
export function formatFairnessGap(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${trimmedNumber(value)}`;
}

/**
 * "+1.40" / "-0.20" / "0" -- calm delta semantics (PR #15 §11): a positive
 * delta does not mean "bad", a negative delta does not mean "good", it
 * only means the score changed. A missing previous score is NEVER shown
 * as if it were 0.
 */
export function formatFairnessDelta(value: number | null): string {
  if (value === null) return "חדש · אין ניקוד קודם";
  if (value === 0) return "0";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

export function formatNormalizedLoad(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/** "🚫 שמירות" -- exemptions must be visible without a tooltip/hover (PR #15 §37). */
export function exemptionBadgeLabel(exemption: ManagerFairnessExemptionView): string {
  return `🚫 ${exemption.raw}`;
}
