import type { DutyPaceStatus } from "@/lib/domain/dutyPace";
import type { FairnessExemption } from "@/lib/domain/fairnessExemptions";
import type { FairnessStatus } from "@/lib/domain/fairnessFoundation";

/** "6.35" stays as-is; "5.00" trims to "5"; "7.10" trims to "7.1". Never re-derives the value itself -- purely cosmetic. */
function trimmedNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/** Rounds to the nearest 0.5 (e.g. 6.35 -> 6.5, 6.2 -> 6, 6.26 -> 6.5) -- display rounding only, never changes the underlying raw value it's derived from. */
export function roundToNearestHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Justice Table redesign -- Shift Fairness's own "Expected values should be
 * displayed rounded to the nearest 0.5 for readability, without changing
 * the underlying raw calculation" rule. Deliberately SHIFT-ONLY: Duty
 * Fairness's target/score values keep their existing full-precision display
 * (`formatFairnessScore`) -- the spec's rounding instruction is scoped to
 * shift targets specifically. "—" for `null`, never a fabricated 0.
 */
export function formatFairnessExpectedValue(value: number | null): string {
  return value === null ? "—" : trimmedNumber(roundToNearestHalf(value));
}

/**
 * Justice Table redesign -- a human-readable status state instead of a raw
 * signed gap number (e.g. never "Gap: -1"). `"balanced"` reads as "on
 * expected level"; `"below"`/`"above"` are qualified with the rounded (to
 * the nearest 0.5, purely for display) magnitude of `deviation`, e.g.
 * "1 מתחת לצפוי" / "0.5 מעל הצפוי". `null` whenever `status`/`deviation`
 * is unavailable -- the generic "לא ניתן להשוות", same vocabulary
 * `fairnessStatusLabel` already uses for an unavailable comparison.
 */
export function formatFairnessDeviationState(deviation: number | null, status: FairnessStatus | null): string {
  if (status === null || deviation === null) return "לא ניתן להשוות";
  if (status === "balanced") return "בהתאם לצפוי";
  const magnitude = trimmedNumber(roundToNearestHalf(Math.abs(deviation)));
  return status === "below" ? `${magnitude} מתחת לצפוי` : `${magnitude} מעל הצפוי`;
}

/**
 * Justice Table redesign -- Duty pace's own restrained, secondary badge
 * text: "given how much of the relevant period has passed, are they where
 * they should be?" (`lib/domain/dutyPace.ts`), deliberately worded
 * differently from the progress/target vocabulary above so the two
 * questions never read as the same thing. `null` (no target, or completed
 * work unknown) renders nothing -- the caller simply omits the badge.
 */
export function formatDutyPaceLabel(pace: DutyPaceStatus | null): string | null {
  if (pace === "below_pace") return "מתחת לקצב";
  if (pace === "ahead_of_pace") return "לפני הקצב";
  if (pace === "on_pace") return "בקצב הצפוי";
  return null;
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

/**
 * "🚫 שמירות" -- exemptions must be visible without a tooltip/hover (PR
 * #15 §37). Typed against the domain `FairnessExemption` shape directly
 * (PR #4 -- the old manager-only `ManagerFairnessExemptionView` this used
 * to take is gone) -- both the Shift and Duty Fairness read models'
 * exemption views mirror this same `{raw, affectedDutyFamilies}` shape,
 * so this one formatter keeps serving every Fairness surface.
 */
export function exemptionBadgeLabel(exemption: FairnessExemption): string {
  return `🚫 ${exemption.raw}`;
}
