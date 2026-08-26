import { describe, expect, it } from "vitest";
import { computeEmergencyFairnessCounts } from "./emergencyFairness";
import type { EmergencyAssignment } from "./emergencyShift";

function assignment(overrides: Partial<EmergencyAssignment> = {}): EmergencyAssignment {
  return {
    date: "2026-08-26",
    period: "day",
    desk: "הוגוורט",
    personId: "p1",
    personName: "דני בדיקה",
    sourceCell: "C2",
    ...overrides,
  };
}

describe("computeEmergencyFairnessCounts", () => {
  it("one populated desk cell = one assignment", () => {
    const counts = computeEmergencyFairnessCounts([assignment()]);
    expect(counts.get("p1")).toEqual({ personId: "p1", total: 1, day: 1, night: 0 });
  });

  it("the same person in two desk cells (even the same shift) counts as TWO assignments", () => {
    const counts = computeEmergencyFairnessCounts([
      assignment({ desk: "הוגוורט", sourceCell: "C2" }),
      assignment({ desk: "תיעוד", sourceCell: "J2" }),
    ]);
    expect(counts.get("p1")?.total).toBe(2);
  });

  it("breaks down day vs night correctly", () => {
    const counts = computeEmergencyFairnessCounts([
      assignment({ period: "day" }),
      assignment({ period: "night", sourceCell: "C3" }),
      assignment({ period: "night", sourceCell: "C4" }),
    ]);
    expect(counts.get("p1")).toEqual({ personId: "p1", total: 3, day: 1, night: 2 });
  });

  it("never attributes an unresolved assignment (personId null) to anyone", () => {
    const counts = computeEmergencyFairnessCounts([assignment({ personId: null })]);
    expect(counts.size).toBe(0);
  });

  it("counts total correctly across multiple distinct people", () => {
    const counts = computeEmergencyFairnessCounts([
      assignment({ personId: "p1", desk: "הוגוורט" }),
      assignment({ personId: "p2", desk: "תיעוד", sourceCell: "J2" }),
    ]);
    expect(counts.get("p1")?.total).toBe(1);
    expect(counts.get("p2")?.total).toBe(1);
  });
});
