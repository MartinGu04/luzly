import { describe, expect, it } from "vitest";
import { fairnessStatusLabel } from "./fairnessStatus";

describe("fairnessStatusLabel", () => {
  it("below -> מתחת ליעד", () => {
    expect(fairnessStatusLabel("below")).toBe("מתחת ליעד");
  });

  it("balanced -> מאוזן", () => {
    expect(fairnessStatusLabel("balanced")).toBe("מאוזן");
  });

  it("above -> מעל היעד", () => {
    expect(fairnessStatusLabel("above")).toBe("מעל היעד");
  });

  it("null is NOT a fourth verdict -- it says the comparison couldn't be produced", () => {
    expect(fairnessStatusLabel(null)).toBe("לא ניתן להשוות");
  });

  it("the null label is generic, never naming 'יעד' (target) specifically -- a null status can equally come from a missing actual/current value, which this function has no way to distinguish", () => {
    expect(fairnessStatusLabel(null)).not.toContain("יעד");
  });
});

// Shift Fairness's own badge/status vocabulary now lives entirely in
// `shiftFairRange.ts` (`shiftFairRangeStatusLabel`) -- it reasons about the
// realizable whole-shift RANGE, not the raw below/balanced/above status
// this file's `fairnessStatusLabel` still serves (Duty Fairness, and this
// module's own generic null-comparison phrase). See
// `shiftFairRange.test.ts` for that vocabulary's own coverage.
