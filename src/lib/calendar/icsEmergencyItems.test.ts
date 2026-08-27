import { describe, expect, it } from "vitest";
import type { EmergencyShift } from "@/lib/domain/emergencyShift";
import { buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { buildEmergencyShiftCalendarItem, emergencyShiftEventUid } from "./icsEmergencyItems";

const SCHEDULE: ShiftSchedule = buildShiftSchedule("07:30");

function shift(overrides: Partial<EmergencyShift> = {}): EmergencyShift {
  return {
    date: "2026-08-19",
    period: "day",
    assignments: [
      { date: "2026-08-19", period: "day", desk: "הוגוורט", personId: "p1", personName: "דני בדיקה", sourceCell: "C2" },
      { date: "2026-08-19", period: "day", desk: "תיעוד", personId: "p2", personName: "נועה דוגמה", sourceCell: "J2" },
    ],
    ...overrides,
  };
}

describe("emergencyShiftEventUid", () => {
  it("is deterministic for the same person+date+period", () => {
    const a = emergencyShiftEventUid("p1", "2026-08-19", "day");
    const b = emergencyShiftEventUid("p1", "2026-08-19", "day");
    expect(a).toBe(b);
  });

  it("differs for a different person on the same date+period", () => {
    const a = emergencyShiftEventUid("p1", "2026-08-19", "day");
    const b = emergencyShiftEventUid("p2", "2026-08-19", "day");
    expect(a).not.toBe(b);
  });

  it("differs for a different period on the same date+person", () => {
    const a = emergencyShiftEventUid("p1", "2026-08-19", "day");
    const b = emergencyShiftEventUid("p1", "2026-08-19", "night");
    expect(a).not.toBe(b);
  });

  it("never leaks the personId verbatim into the UID", () => {
    const uid = emergencyShiftEventUid("p_secret_id", "2026-08-19", "day");
    expect(uid).not.toContain("p_secret_id");
  });
});

describe("buildEmergencyShiftCalendarItem", () => {
  it("returns null when schedule is broken (never an invented time)", () => {
    expect(buildEmergencyShiftCalendarItem(shift(), "p1", null)).toBeNull();
  });

  it("returns null when the viewed person has no assignment in this shift at all", () => {
    expect(buildEmergencyShiftCalendarItem(shift(), "p_someone_else", SCHEDULE)).toBeNull();
  });

  it("summary names the person's own desk, never a role/coverage concept", () => {
    const item = buildEmergencyShiftCalendarItem(shift(), "p1", SCHEDULE);
    expect(item).not.toBeNull();
    expect(item?.summary).toContain("הוגוורט");
    expect(item?.summary).toContain("יום");
  });

  it("lists every OTHER person on the same shift in the description, never the viewed person themselves", () => {
    const item = buildEmergencyShiftCalendarItem(shift(), "p1", SCHEDULE);
    expect(item?.description).toContain("נועה דוגמה -- תיעוד");
    expect(item?.description).not.toContain("דני בדיקה");
  });

  it("description is null when no one else shares the shift", () => {
    const soloShift = shift({
      assignments: [{ date: "2026-08-19", period: "day", desk: "הוגוורט", personId: "p1", personName: "דני בדיקה", sourceCell: "C2" }],
    });
    const item = buildEmergencyShiftCalendarItem(soloShift, "p1", SCHEDULE);
    expect(item?.description).toBeNull();
  });

  it("uses the day/night start-end minutes from the SAME regular ShiftSchedule -- never a separate emergency timing concept", () => {
    const dayItem = buildEmergencyShiftCalendarItem(shift({ period: "day" }), "p1", SCHEDULE);
    const nightItem = buildEmergencyShiftCalendarItem(
      shift({
        period: "night",
        assignments: [{ date: "2026-08-19", period: "night", desk: "הוגוורט", personId: "p1", personName: "דני בדיקה", sourceCell: "C3" }],
      }),
      "p1",
      SCHEDULE,
    );
    expect(dayItem?.timing.kind).toBe("timed");
    expect(nightItem?.timing.kind).toBe("timed");
    if (dayItem?.timing.kind !== "timed" || nightItem?.timing.kind !== "timed") return;
    expect(dayItem.timing.startUtc.getTime()).not.toBe(nightItem.timing.startUtc.getTime());
  });

  it("multiple own desks in the same shift all appear in the summary", () => {
    const multiDeskShift = shift({
      assignments: [
        { date: "2026-08-19", period: "day", desk: "הוגוורט", personId: "p1", personName: "דני בדיקה", sourceCell: "C2" },
        { date: "2026-08-19", period: "day", desk: "תיעוד", personId: "p1", personName: "דני בדיקה", sourceCell: "J2" },
      ],
    });
    const item = buildEmergencyShiftCalendarItem(multiDeskShift, "p1", SCHEDULE);
    expect(item?.summary).toContain("הוגוורט");
    expect(item?.summary).toContain("תיעוד");
  });

  it("the UID matches emergencyShiftEventUid for the same person+date+period", () => {
    const item = buildEmergencyShiftCalendarItem(shift(), "p1", SCHEDULE);
    expect(item?.uid).toBe(emergencyShiftEventUid("p1", "2026-08-19", "day"));
  });
});
