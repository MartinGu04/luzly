import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/domain/event";
import { buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { buildCalendarItem, calendarEventUid } from "./icsItems";

const SCHEDULE: ShiftSchedule = buildShiftSchedule("07:30");

function baseEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p1",
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

describe("calendarEventUid", () => {
  it("is deterministic for the same sourceSheet+sourceCell", () => {
    const a = calendarEventUid({ sourceSheet: "sheet", sourceCell: "C15" });
    const b = calendarEventUid({ sourceSheet: "sheet", sourceCell: "C15" });
    expect(a).toBe(b);
  });

  it("differs for a different cell (even same sheet, adjacent date column)", () => {
    const a = calendarEventUid({ sourceSheet: "sheet", sourceCell: "C15" });
    const b = calendarEventUid({ sourceSheet: "sheet", sourceCell: "D15" });
    expect(a).not.toBe(b);
  });

  it("differs for a different sheet (same cell reference)", () => {
    const a = calendarEventUid({ sourceSheet: "potentialH1", sourceCell: "C15" });
    const b = calendarEventUid({ sourceSheet: "potentialH2", sourceCell: "C15" });
    expect(a).not.toBe(b);
  });

  it("is stable across a changed start/end override on the SAME cell -- this is what makes 'update, not duplicate' work", () => {
    const before = baseEvent({ startTimeOverride: null });
    const after = baseEvent({ startTimeOverride: "09:00" });
    expect(calendarEventUid(before)).toBe(calendarEventUid(after));
  });

  it("never leaks the raw sheet name/cell reference verbatim into the UID", () => {
    const uid = calendarEventUid({ sourceSheet: "לוח משמרות", sourceCell: "C15" });
    expect(uid).not.toContain("לוח משמרות");
    expect(uid).not.toContain("C15");
    expect(uid).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildCalendarItem -- shift events", () => {
  it("resolves a day shift to a timed item with the canonical schedule interval", () => {
    const event = baseEvent({ category: "shift", role: "supervisor", period: "day" });
    const item = buildCalendarItem(event, SCHEDULE);
    expect(item).not.toBeNull();
    expect(item!.timing.kind).toBe("timed");
    if (item!.timing.kind === "timed") {
      // day shift: 07:30-19:30 Asia/Jerusalem on 2026-08-19 -- IDT (UTC+3) in August.
      expect(item!.timing.startUtc.toISOString()).toBe("2026-08-19T04:30:00.000Z");
      expect(item!.timing.endUtc.toISOString()).toBe("2026-08-19T16:30:00.000Z");
    }
  });

  it("an overnight night shift's end lands on the NEXT calendar date", () => {
    const event = baseEvent({ category: "shift", role: "technician", period: "night" });
    const item = buildCalendarItem(event, SCHEDULE);
    expect(item!.timing.kind).toBe("timed");
    if (item!.timing.kind === "timed") {
      // night shift: 19:30 on 2026-08-19 -> 07:30 on 2026-08-20.
      expect(item!.timing.startUtc.toISOString()).toBe("2026-08-19T16:30:00.000Z");
      expect(item!.timing.endUtc.toISOString()).toBe("2026-08-20T04:30:00.000Z");
    }
  });

  it("returns null (never an invented time) for an unresolvable shift (unspecified period)", () => {
    const event = baseEvent({ category: "shift", period: "unspecified" });
    expect(buildCalendarItem(event, SCHEDULE)).toBeNull();
  });

  it("returns null for a shift when schedule is null (broken shift-time configuration)", () => {
    const event = baseEvent({ category: "shift" });
    expect(buildCalendarItem(event, null)).toBeNull();
  });

  it("summary combines role + period labels", () => {
    const event = baseEvent({ category: "shift", role: "supervisor", period: "day" });
    const item = buildCalendarItem(event, SCHEDULE);
    expect(item!.summary).toBe('אחמ"ש יום');
  });

  it("summary marks a shadow shift", () => {
    const event = baseEvent({ category: "shift", role: "technician", period: "night", shadow: true });
    const item = buildCalendarItem(event, SCHEDULE);
    expect(item!.summary).toBe("טכנאי לילה (צל)");
  });

  it("description flags a tentative assignment and an overridden time, omits nothing invented", () => {
    const tentative = baseEvent({ category: "shift", certainty: "tentative" });
    expect(buildCalendarItem(tentative, SCHEDULE)!.description).toContain("משוער");

    const confirmed = baseEvent({ category: "shift", certainty: "confirmed" });
    expect(buildCalendarItem(confirmed, SCHEDULE)!.description).toBeNull();
  });
});

describe("buildCalendarItem -- duty events", () => {
  it("is an all-day item on the event's own date, independent of shiftSchedule", () => {
    const event = baseEvent({ category: "duty", dutyFamily: "guard", slot: 2, role: null, period: "unspecified" });
    const withSchedule = buildCalendarItem(event, SCHEDULE);
    const withoutSchedule = buildCalendarItem(event, null);
    expect(withSchedule).toEqual(withoutSchedule);
    expect(withSchedule!.timing).toEqual({ kind: "allDay", date: "2026-08-19" });
  });

  it("summary is the duty family label + slot", () => {
    const event = baseEvent({ category: "duty", dutyFamily: "guard", slot: 2 });
    expect(buildCalendarItem(event, SCHEDULE)!.summary).toBe("שמירה 2");
  });

  it("summary omits the slot when the duty family has none", () => {
    const event = baseEvent({ category: "duty", dutyFamily: "oxid", slot: null });
    expect(buildCalendarItem(event, SCHEDULE)!.summary).toBe("אוקסיד");
  });
});

describe("buildCalendarItem -- absence events", () => {
  it("is an all-day item, summary is the absence-kind label", () => {
    const event = baseEvent({ category: "absence", absenceKind: "vacation", role: null, period: "unspecified" });
    const item = buildCalendarItem(event, SCHEDULE);
    expect(item!.timing).toEqual({ kind: "allDay", date: "2026-08-19" });
    expect(item!.summary).toBe("חופש");
  });
});
