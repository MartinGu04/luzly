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
