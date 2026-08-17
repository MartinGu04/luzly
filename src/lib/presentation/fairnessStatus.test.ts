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
    expect(fairnessStatusLabel(null)).toBe("לא ניתן לחשב יעד מלא");
  });
});
