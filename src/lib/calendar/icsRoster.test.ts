import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/domain/event";
import { buildShiftRosterDescription } from "./icsRoster";

function shiftEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_dani",
    personName: "דני בדיקה",
    date: "2026-08-19",
    title: 'אחמ"ש יום',
    rawValue: 'אחמ"ש יום',
    category: "shift",
    certainty: "confirmed",
    role: "supervisor",
    period: "day",
    sourceSheet: "לוח משמרות",
    sourceCell: "C15",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: null,
    absenceKind: null,
    ...overrides,
  };
}

describe("buildShiftRosterDescription", () => {
  it("returns null when nobody else is on the shift", () => {
    const target = shiftEvent();
    expect(buildShiftRosterDescription(target, [target])).toBeNull();
  });

  it("groups colleagues by role, formatted as requested", () => {
    const target = shiftEvent();
    const noa = shiftEvent({ personId: "p_noa", personName: "נועה דוגמה", role: "technician" });
    const eitan = shiftEvent({ personId: "p_eitan", personName: "איתן דוגמה", role: "supervisor" });

    const description = buildShiftRosterDescription(target, [target, noa, eitan]);

    expect(description).toBe('איתך במשמרת:\nאחמ"ש: איתן דוגמה\nטכנאים: נועה דוגמה');
  });

  it("omits the technician line entirely when no technician is on the shift", () => {
    const target = shiftEvent();
    const eitan = shiftEvent({ personId: "p_eitan", personName: "איתן דוגמה", role: "supervisor" });

    expect(buildShiftRosterDescription(target, [target, eitan])).toBe('איתך במשמרת:\nאחמ"ש: איתן דוגמה');
  });

  it("omits the supervisor line entirely when no supervisor is on the shift", () => {
    const target = shiftEvent();
    const noa = shiftEvent({ personId: "p_noa", personName: "נועה דוגמה", role: "technician" });

    expect(buildShiftRosterDescription(target, [target, noa])).toBe("איתך במשמרת:\nטכנאים: נועה דוגמה");
  });

  it("joins multiple people in the same role group with a comma", () => {
    const target = shiftEvent();
    const noa = shiftEvent({ personId: "p_noa", personName: "נועה דוגמה", role: "technician" });
    const yoni = shiftEvent({ personId: "p_yoni", personName: "יוני דוגמה", role: "technician" });

    expect(buildShiftRosterDescription(target, [target, noa, yoni])).toBe(
      "איתך במשמרת:\nטכנאים: נועה דוגמה, יוני דוגמה",
    );
  });

  it("never lists the target person themselves, even with a split-shift second Event of their own", () => {
    const target = shiftEvent();
    const targetSplitEvent = shiftEvent({ sourceCell: "C16" }); // same person, second Event same date/period
    expect(buildShiftRosterDescription(target, [target, targetSplitEvent])).toBeNull();
  });

  it("de-duplicates a genuine split-shift colleague appearing as two Events", () => {
    const target = shiftEvent();
    const noaEvent1 = shiftEvent({ personId: "p_noa", personName: "נועה דוגמה", role: "technician", sourceCell: "D15" });
    const noaEvent2 = shiftEvent({ personId: "p_noa", personName: "נועה דוגמה", role: "technician", sourceCell: "D16" });

    expect(buildShiftRosterDescription(target, [target, noaEvent1, noaEvent2])).toBe(
      "איתך במשמרת:\nטכנאים: נועה דוגמה",
    );
  });

  it("excludes shadow colleagues from the roster -- never counted as real staffing companions", () => {
    const target = shiftEvent();
    const shadowNoa = shiftEvent({ personId: "p_noa", personName: "נועה דוגמה", role: "technician", shadow: true });
    expect(buildShiftRosterDescription(target, [target, shadowNoa])).toBeNull();
  });

  it("never leaks a colleague from a DIFFERENT date into the roster", () => {
    const target = shiftEvent();
    const otherDate = shiftEvent({ personId: "p_noa", personName: "נועה דוגמה", role: "technician", date: "2026-08-20" });
    expect(buildShiftRosterDescription(target, [target, otherDate])).toBeNull();
  });

  it("never leaks a colleague from a DIFFERENT period (same date) into the roster", () => {
    const target = shiftEvent();
    const otherPeriod = shiftEvent({ personId: "p_noa", personName: "נועה דוגמה", role: "technician", period: "night" });
    expect(buildShiftRosterDescription(target, [target, otherPeriod])).toBeNull();
  });

  it("never crashes and returns null for a non-shift target Event (duty/absence never get a roster)", () => {
    const dutyTarget = shiftEvent({ category: "duty", dutyFamily: "guard", slot: 1, role: null, period: "unspecified" });
    const someone = shiftEvent({ personId: "p_noa", personName: "נועה דוגמה" });
    expect(buildShiftRosterDescription(dutyTarget, [dutyTarget, someone])).toBeNull();
  });
});
