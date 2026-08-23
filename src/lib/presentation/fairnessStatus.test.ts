import { describe, expect, it } from "vitest";
import { fairnessShiftStatusLabel, fairnessStatusLabel } from "./fairnessStatus";

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

describe("fairnessShiftStatusLabel — Shift Fairness's own 'expected', never 'target', badge vocabulary", () => {
  it("below -> מתחת לצפוי", () => {
    expect(fairnessShiftStatusLabel("below")).toBe("מתחת לצפוי");
  });

  it("balanced -> מאוזן", () => {
    expect(fairnessShiftStatusLabel("balanced")).toBe("מאוזן");
  });

  it("above -> מעל הצפוי (never 'מעל היעד' -- Shift's comparison value is an adjusted expectation up to today, not a fixed target)", () => {
    expect(fairnessShiftStatusLabel("above")).toBe("מעל הצפוי");
  });

  it("null -> the same generic 'comparison unavailable' phrase as fairnessStatusLabel", () => {
    expect(fairnessShiftStatusLabel(null)).toBe("לא ניתן להשוות");
  });

  it("never says 'יעד' (target) for any real status", () => {
    expect(fairnessShiftStatusLabel("below")).not.toContain("יעד");
    expect(fairnessShiftStatusLabel("above")).not.toContain("יעד");
    expect(fairnessShiftStatusLabel("balanced")).not.toContain("יעד");
  });
});
