/**
 * Shift Fairness's human-readable "fair range" presentation -- a person
 * cannot actually work half a shift, so a raw fractional expected value
 * like `5.5` (the engine's real, unrounded opportunity-share target,
 * `fairnessShiftEngine.ts`) is confusing shown on its own. This module
 * turns that EXACT value into a whole-shift RANGE ("5–6") and a status
 * that reasons about where `actualShifts` falls relative to that range,
 * purely for display -- it never rounds, replaces, or otherwise touches
 * the underlying fractional `target`/`deviation`/`status` the engine
 * computes, which stay exactly as they are for every other consumer
 * (`shiftFairnessVisibility.ts`'s row-visibility filter, and anything a
 * future manager/analytics feature might read).
 *
 * `lower`/`upper` are simply `Math.floor`/`Math.ceil` of the exact value --
 * deliberately NEVER pre-rounded (e.g. via `roundToNearestHalf`, the
 * existing display-rounding `formatFairnessExpectedValue` uses) first,
 * since rounding a value like `5.2` to `5` or `5.5` before taking
 * floor/ceil would silently produce the wrong range. The tiny epsilon
 * guard exists ONLY for genuine floating-point representation noise from
 * the opportunity-share division (e.g. `42 * (9 / 14)` evaluates to
 * `27.000000000000004` in IEEE 754, not the mathematically exact `27` --
 * verified against this codebase's real formula), which would otherwise
 * wrongly show "27–28" for what is genuinely a whole-number expectation.
 * This is NEVER semantic rounding of a real fractional value -- an
 * `1e-9` guard cannot turn `5.2` into anything but `[5, 6]`, only correct
 * `26.999999999999996`-style noise back to its true integer.
 */

const FLOAT_EQUALITY_EPSILON = 1e-9;

export interface FairShiftRangeBounds {
  lower: number;
  upper: number;
}

/** `null` in, `null` out -- the caller (an unmodelable member with no target) has no range to show. */
export function fairShiftRangeBounds(expected: number): FairShiftRangeBounds {
  return {
    lower: Math.floor(expected + FLOAT_EQUALITY_EPSILON),
    upper: Math.ceil(expected - FLOAT_EQUALITY_EPSILON),
  };
}

/**
 * "5" for a whole-number expected value, "5–6" for a fractional one
 * (`lower`-`upper` inclusive) -- an EN DASH (–), not a hyphen, matching
 * this codebase's existing Hebrew-UI number-range convention. `"—"` for
 * `null` (no target available), never a fabricated range.
 */
export function formatFairShiftRange(expected: number | null): string {
  if (expected === null) return "—";
  const { lower, upper } = fairShiftRangeBounds(expected);
  return lower === upper ? String(lower) : `${lower}–${upper}`;
}

/**
 * The ONE mutually-exclusive "how does actual compare to the fair range"
 * state this module exposes -- deliberately NOT the same type as
 * `FairnessStatus` (`fairnessFoundation.ts`), and never used in place of
 * it anywhere the exact deviation/status still matters. `"slightly_above"`
 * exists ONLY because a real fractional range has genuine room for "one
 * shift past the top of the range" to read differently from "clearly
 * above it" -- a WHOLE-NUMBER expected value has no such room (its range
 * is a single point), so going even one shift over it is unambiguously
 * `"above"`, the exact same call the pre-existing ±0.5-tolerance
 * `resolveFairnessShiftStatus` already made for an integer target. There
 * is deliberately no symmetric `"slightly_below"` -- being under the fair
 * range is a single, plain `"below"` regardless of magnitude, same as the
 * pre-existing model never further distinguished "below" by how far.
 */
export type ShiftFairRangeStatus = "below" | "within" | "slightly_above" | "above";

/** `null` in (no modelable target), `null` out -- there is no range to compare `actualShifts` against. */
export function resolveShiftFairRangeStatus(actualShifts: number, expected: number | null): ShiftFairRangeStatus | null {
  if (expected === null) return null;

  const { lower, upper } = fairShiftRangeBounds(expected);
  if (actualShifts < lower) return "below";
  if (actualShifts <= upper) return "within";

  // actualShifts > upper from here on.
  if (lower === upper) return "above"; // whole-number expectation -- no fractional range, so no "slightly" tier.
  return actualShifts === upper + 1 ? "slightly_above" : "above";
}

/** Hebrew label for the range-aware status -- what the card's "מצב" row shows. Generic "לא ניתן להשוות" for `null`, same phrase every other Fairness status uses for an unavailable comparison. */
export function shiftFairRangeStatusLabel(status: ShiftFairRangeStatus | null): string {
  switch (status) {
    case "below":
      return "מתחת לצפי";
    case "within":
      return "בטווח הצפי";
    case "slightly_above":
      return "מעט מעל הצפי";
    case "above":
      return "מעל הצפי";
    default:
      return "לא ניתן להשוות";
  }
}

/**
 * The longer, DESCRIPTIVE wording for the card's own "מצב" section --
 * deliberately a SEPARATE label from `shiftFairRangeStatusLabel` above
 * (the badge's short word), so the badge and the "מצב" row no longer show
 * the exact same text right next to each other on the same card. Both
 * still derive from the SAME already-resolved `ShiftFairRangeStatus` --
 * this is wording only, never a second status calculation. The fuller
 * explanatory sentence (`statusExplanationLabel`, `fairnessCards.ts`)
 * stays as-is beneath this, unaffected.
 */
export function shiftFairRangeStatusDescriptiveLabel(status: ShiftFairRangeStatus | null): string {
  switch (status) {
    case "below":
      return "פחות מהטווח ההוגן";
    case "within":
      return "בתוך הטווח ההוגן";
    case "slightly_above":
      return "מעט מעל הטווח ההוגן";
    case "above":
      return "מעל הטווח ההוגן";
    default:
      return "לא ניתן להשוות";
  }
}

/**
 * Maps the 4-state range status onto the shared 3-tint `FairnessStatus`
 * vocabulary (`fairnessFoundation.ts`) -- ONLY for driving
 * `FairnessStatusBadge`'s existing below/balanced/above tint+icon, which
 * this module deliberately does not reimplement or extend to a 4th color.
 * `"slightly_above"` and `"above"` share the SAME "above" tint -- the
 * nuance between them lives in the label text
 * (`shiftFairRangeStatusLabel`), passed to the badge's own `label`
 * override prop, never in a new color.
 */
export function shiftFairRangeStatusBadgeTone(status: ShiftFairRangeStatus | null): "below" | "balanced" | "above" | null {
  switch (status) {
    case "below":
      return "below";
    case "within":
      return "balanced";
    case "slightly_above":
    case "above":
      return "above";
    default:
      return null;
  }
}
