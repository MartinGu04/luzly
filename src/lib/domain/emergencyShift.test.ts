import { describe, expect, it } from "vitest";
import { groupEmergencyAssignmentsIntoShifts, type EmergencyAssignment } from "./emergencyShift";

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

describe("groupEmergencyAssignmentsIntoShifts", () => {
  it("groups assignments sharing the same date+period into one shift", () => {
    const shifts = groupEmergencyAssignmentsIntoShifts([
      assignment({ desk: "הוגוורט", personId: "p1" }),
      assignment({ desk: "תיעוד", personId: "p2", personName: "אחר" }),
    ]);

    expect(shifts).toHaveLength(1);
    expect(shifts[0].assignments).toHaveLength(2);
  });

  it("keeps different periods on the same date as separate shifts, day before night", () => {
    const shifts = groupEmergencyAssignmentsIntoShifts([
      assignment({ period: "night" }),
      assignment({ period: "day" }),
    ]);

    expect(shifts).toHaveLength(2);
    expect(shifts[0].period).toBe("day");
    expect(shifts[1].period).toBe("night");
  });

  it("sorts shifts by date ascending", () => {
    const shifts = groupEmergencyAssignmentsIntoShifts([
      assignment({ date: "2026-08-27" }),
      assignment({ date: "2026-08-26" }),
    ]);

    expect(shifts.map((s) => s.date)).toEqual(["2026-08-26", "2026-08-27"]);
  });

  it("returns an empty array for no assignments", () => {
    expect(groupEmergencyAssignmentsIntoShifts([])).toEqual([]);
  });
});
