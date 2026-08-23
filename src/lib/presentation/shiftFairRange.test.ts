import { describe, expect, it } from "vitest";
import {
  fairShiftRangeBounds,
  formatFairShiftRange,
  resolveShiftFairRangeStatus,
  shiftFairRangeStatusBadgeTone,
  shiftFairRangeStatusDescriptiveLabel,
  shiftFairRangeStatusLabel,
} from "./shiftFairRange";

describe("formatFairShiftRange", () => {
  it.each([
    [5, "5"],
    [5.5, "5–6"],
    [5.2, "5–6"],
    [5.8, "5–6"],
    [0, "0"],
    [0.5, "0–1"],
    [6, "6"],
  ])("%s -> %s", (expected, label) => {
    expect(formatFairShiftRange(expected)).toBe(label);
  });

  it("null -> '—', never a fabricated range", () => {
    expect(formatFairShiftRange(null)).toBe("—");
  });

  it("never pre-rounds the value before deriving the range -- 5.2 and 5.8 both stay 5–6, never collapsing toward 5.5's own range by accident", () => {
    // A pre-rounding bug (e.g. rounding to the nearest 0.5 first) would
    // still coincidentally produce "5–6" for these two, since they're
    // already inside that band -- this instead directly proves the
    // boundary logic itself, at the exact edges floor/ceil actually use.
    expect(formatFairShiftRange(5.0001)).toBe("5–6");
    expect(formatFairShiftRange(5.9999)).toBe("5–6");
  });

  it("a floating-point-noise near-integer value (real formula: 42 * (9/14) = 27.000000000000004) still shows a single integer, never a fabricated '27–28'", () => {
    const noisyTarget = 42 * (9 / 14);
    expect(Number.isInteger(noisyTarget)).toBe(false); // proves the noise is real, not a contrived assumption
    expect(formatFairShiftRange(noisyTarget)).toBe("27");
  });
});

describe("fairShiftRangeBounds", () => {
  it("whole number -> lower === upper", () => {
    expect(fairShiftRangeBounds(6)).toEqual({ lower: 6, upper: 6 });
  });

  it("fractional -> floor/ceil", () => {
    expect(fairShiftRangeBounds(5.5)).toEqual({ lower: 5, upper: 6 });
    expect(fairShiftRangeBounds(5.2)).toEqual({ lower: 5, upper: 6 });
  });
});

describe("resolveShiftFairRangeStatus — fractional expected (5.5, range 5–6)", () => {
  it.each([
    [5, "within"],
    [6, "within"],
    [7, "slightly_above"],
    [8, "above"],
    [4, "below"],
  ] as const)("actual %s -> %s", (actual, status) => {
    expect(resolveShiftFairRangeStatus(actual, 5.5)).toBe(status);
  });

  it("further above the range keeps returning 'above', never reverting to 'slightly_above'", () => {
    expect(resolveShiftFairRangeStatus(9, 5.5)).toBe("above");
    expect(resolveShiftFairRangeStatus(20, 5.5)).toBe("above");
  });

  it("further below the range stays 'below' with no further granularity, matching the pre-existing model's own below semantics", () => {
    expect(resolveShiftFairRangeStatus(3, 5.5)).toBe("below");
    expect(resolveShiftFairRangeStatus(0, 5.5)).toBe("below");
  });
});

describe("resolveShiftFairRangeStatus — whole-number expected (5), reusing the pre-existing severity model with no 'slightly' tier", () => {
  it("actual 5 -> within (exact match)", () => {
    expect(resolveShiftFairRangeStatus(5, 5)).toBe("within");
  });

  it("actual 6 -> above, NEVER 'slightly_above' -- a whole-number expectation has no fractional range to be adjacent to", () => {
    expect(resolveShiftFairRangeStatus(6, 5)).toBe("above");
  });

  it("actual 4 -> below", () => {
    expect(resolveShiftFairRangeStatus(4, 5)).toBe("below");
  });
});

describe("resolveShiftFairRangeStatus — a low fractional expected value (0.5, range 0–1)", () => {
  it.each([
    [0, "within"],
    [1, "within"],
    [2, "slightly_above"],
    [3, "above"],
  ] as const)("actual %s -> %s", (actual, status) => {
    expect(resolveShiftFairRangeStatus(actual, 0.5)).toBe(status);
  });
});

describe("resolveShiftFairRangeStatus — null expected", () => {
  it("returns null -- no target to compare against", () => {
    expect(resolveShiftFairRangeStatus(5, null)).toBeNull();
  });
});

describe("shiftFairRangeStatusLabel", () => {
  it.each([
    ["below", "מתחת לצפי"],
    ["within", "בטווח הצפי"],
    ["slightly_above", "מעט מעל הצפי"],
    ["above", "מעל הצפי"],
  ] as const)("%s -> %s", (status, label) => {
    expect(shiftFairRangeStatusLabel(status)).toBe(label);
  });

  it("null -> the generic unavailable phrase, same as every other Fairness status", () => {
    expect(shiftFairRangeStatusLabel(null)).toBe("לא ניתן להשוות");
  });
});

describe("shiftFairRangeStatusDescriptiveLabel — the card's \"מצב\" row wording, deliberately different from the badge's shiftFairRangeStatusLabel", () => {
  it.each([
    ["below", "פחות מהטווח ההוגן"],
    ["within", "בתוך הטווח ההוגן"],
    ["slightly_above", "מעט מעל הטווח ההוגן"],
    ["above", "מעל הטווח ההוגן"],
  ] as const)("%s -> %s", (status, label) => {
    expect(shiftFairRangeStatusDescriptiveLabel(status)).toBe(label);
  });

  it("null -> the same generic unavailable phrase as shiftFairRangeStatusLabel", () => {
    expect(shiftFairRangeStatusDescriptiveLabel(null)).toBe("לא ניתן להשוות");
  });

  it("never matches shiftFairRangeStatusLabel's own text for any real status -- the badge and the מצב row must not repeat the same wording", () => {
    for (const status of ["below", "within", "slightly_above", "above"] as const) {
      expect(shiftFairRangeStatusDescriptiveLabel(status)).not.toBe(shiftFairRangeStatusLabel(status));
    }
  });
});

describe("shiftFairRangeStatusBadgeTone — collapses onto the shared 3-tint FairnessStatus vocabulary", () => {
  it("below -> below, within -> balanced", () => {
    expect(shiftFairRangeStatusBadgeTone("below")).toBe("below");
    expect(shiftFairRangeStatusBadgeTone("within")).toBe("balanced");
  });

  it("both slightly_above and above map to the SAME 'above' tone -- the nuance lives in the label text, never a new color", () => {
    expect(shiftFairRangeStatusBadgeTone("slightly_above")).toBe("above");
    expect(shiftFairRangeStatusBadgeTone("above")).toBe("above");
  });

  it("null -> null", () => {
    expect(shiftFairRangeStatusBadgeTone(null)).toBeNull();
  });
});
