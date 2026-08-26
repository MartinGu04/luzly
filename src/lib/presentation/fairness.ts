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
 * Justice Table refinement -- the ONE mutually-exclusive user-facing "how
 * are they doing" state for a target-bearing duty row, layered ON TOP OF
 * (never replacing) the existing pace comparison (`lib/domain/dutyPace.ts`,
 * completely unchanged). `null` (no target, or completed work unknown)
 * renders nothing -- the caller simply omits the badge, exactly like the
 * pace-only badge this replaces.
 *
 * Precedence (highest first) -- see each branch's own reasoning:
 * 1. `completedAllocationTotal > personalTargetTotal` -- `"target_exceeded"`.
 * 2. `completedAllocationTotal >= personalTargetTotal` (effectively equal,
 *    see `FLOAT_EQUALITY_EPSILON` below) -- `"target_reached"`.
 * 3. `completedAllocationTotal === 0` -- `"not_started"`. Deliberately
 *    NEVER falls through to `paceStatus` here, even though the raw pace
 *    math would classify a real, literal 0 as "below_pace" whenever any
 *    meaningful time has elapsed -- "0 completed, nothing scheduled/done
 *    yet" is a calm, factual UX state, not a verdict that this person is
 *    already behind. This is a presentation-only override: `paceStatus`
 *    itself, and the tolerance band it's computed with, are untouched.
 * 4. Otherwise, the EXISTING `paceStatus` (below/on/ahead_of_pace) passes
 *    through completely unchanged -- this function never recomputes pace,
 *    it only decides when to defer to it vs. override it with a plainer,
 *    higher-precedence fact.
 */
export type DutyStatusState = DutyPaceStatus | "not_started" | "target_reached" | "target_exceeded";

/**
 * A floating-point safety margin ONLY -- not a business tolerance (unlike
 * `DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS`, which this never touches).
 * `completedAllocationTotal` is a real sum of many small weights (0.2,
 * 0.25, 0.5, 1.0 -- `lib/domain/dutyAllocationWeight.ts`), so a person
 * whose work genuinely equals their target can land a few floating-point
 * ULPs away from it (e.g. `5.999999999999998`) -- still "6" wherever it is
 * displayed (`formatFairnessScore` rounds to 2 decimals), so the reached/
 * exceeded check must not silently miss it and fall through to a stale
 * pace label instead.
 */
const FLOAT_EQUALITY_EPSILON = 1e-9;

export function resolveDutyStatusState(
  completedAllocationTotal: number | null,
  personalTargetTotal: number | null,
  paceStatus: DutyPaceStatus | null,
): DutyStatusState | null {
  if (personalTargetTotal === null || personalTargetTotal <= 0) return null;
  if (completedAllocationTotal === null) return null;

  const diff = completedAllocationTotal - personalTargetTotal;
  if (diff > FLOAT_EQUALITY_EPSILON) return "target_exceeded";
  if (diff > -FLOAT_EQUALITY_EPSILON) return "target_reached";
  if (completedAllocationTotal === 0) return "not_started";
  return paceStatus;
}

/**
 * Hebrew labels for `resolveDutyStatusState`'s six mutually-exclusive
 * states. Replaces the old pace-only wording ("בקצב הצפוי" / "מתחת לקצב" /
 * "לפני הקצב") with the calmer, more specific set below -- in particular
 * "טרם בוצעו תורנויות" for `"not_started"`, never "מתחת לצפי" ("below
 * expected"), which would read as an accusation for someone who simply
 * hasn't had a duty yet.
 */
export function formatDutyStatusLabel(status: DutyStatusState | null): string | null {
  switch (status) {
    case "not_started":
      return "טרם בוצעו תורנויות";
    case "below_pace":
      return "מתחת לצפי";
    case "on_pace":
      return "בהתאם לצפי";
    case "ahead_of_pace":
      return "מעל לצפי";
    case "suspended":
      return "מושהה בזמן מצב חירום";
    case "target_reached":
      return "היעד הושלם";
    case "target_exceeded":
      return "מעבר ליעד";
    default:
      return null;
  }
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
