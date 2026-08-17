import { describe, expect, it } from "vitest";
import { fairnessDutiesHref, fairnessShiftsHref, parseFairnessMode } from "./fairnessUrl";

describe("parseFairnessMode", () => {
  it("null/missing -> shifts (the default)", () => {
    expect(parseFairnessMode(null)).toBe("shifts");
    expect(parseFairnessMode(undefined)).toBe("shifts");
  });

  it('"duties" -> duties', () => {
    expect(parseFairnessMode("duties")).toBe("duties");
  });

  it('"shifts" -> shifts', () => {
    expect(parseFairnessMode("shifts")).toBe("shifts");
  });

  it("any invalid/unknown value falls back to shifts, never a crash", () => {
    expect(parseFairnessMode("combined")).toBe("shifts");
    expect(parseFairnessMode("")).toBe("shifts");
    expect(parseFairnessMode("DUTIES")).toBe("shifts");
  });
});

describe("fairnessShiftsHref", () => {
  it("no params -> bare /fairness (mode=shifts is the omitted default)", () => {
    expect(fairnessShiftsHref()).toBe("/fairness");
    expect(fairnessShiftsHref({})).toBe("/fairness");
  });

  it("a monthKey sets ?month=YYYY-MM, never mode=", () => {
    const href = fairnessShiftsHref({ monthKey: { year: 2026, month: 8 } });
    expect(href).toBe("/fairness?month=2026-08");
    expect(href).not.toContain("mode=");
  });

  it("a personId sets ?person=", () => {
    expect(fairnessShiftsHref({ personId: "p_1" })).toBe("/fairness?person=p_1");
  });

  it("month and person combine", () => {
    expect(fairnessShiftsHref({ monthKey: { year: 2026, month: 8 }, personId: "p_1" })).toBe(
      "/fairness?month=2026-08&person=p_1",
    );
  });

  it("a null monthKey/personId omits those params, same as not passing them", () => {
    expect(fairnessShiftsHref({ monthKey: null, personId: null })).toBe("/fairness");
  });
});

describe("fairnessDutiesHref", () => {
  it("mode=duties is ALWAYS explicit, even with no other params", () => {
    expect(fairnessDutiesHref()).toBe("/fairness?mode=duties");
  });

  it("a period sets ?period=", () => {
    expect(fairnessDutiesHref({ period: "h1" })).toBe("/fairness?mode=duties&period=h1");
  });

  it("a personId sets ?person=", () => {
    expect(fairnessDutiesHref({ period: "h2", personId: "p_2" })).toBe("/fairness?mode=duties&period=h2&person=p_2");
  });
});
