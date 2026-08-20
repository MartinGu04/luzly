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
    const item = buildCalendarItem(event, SCHEDULE, []);
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
    const item = buildCalendarItem(event, SCHEDULE, []);
    expect(item!.timing.kind).toBe("timed");
    if (item!.timing.kind === "timed") {
      // night shift: 19:30 on 2026-08-19 -> 07:30 on 2026-08-20.
      expect(item!.timing.startUtc.toISOString()).toBe("2026-08-19T16:30:00.000Z");
      expect(item!.timing.endUtc.toISOString()).toBe("2026-08-20T04:30:00.000Z");
    }
  });

  it("returns null (never an invented time) for an unresolvable shift (unspecified period)", () => {
    const event = baseEvent({ category: "shift", period: "unspecified" });
    expect(buildCalendarItem(event, SCHEDULE, [])).toBeNull();
  });

  it("returns null for a shift when schedule is null (broken shift-time configuration)", () => {
    const event = baseEvent({ category: "shift" });
    expect(buildCalendarItem(event, null, [])).toBeNull();
  });

  it("summary combines role + period labels, prefixed with the shift's emoji", () => {
    const event = baseEvent({ category: "shift", role: "supervisor", period: "day" });
    const item = buildCalendarItem(event, SCHEDULE, []);
    expect(item!.summary).toBe('☀️ אחמ"ש יום');
  });

  it("summary marks a shadow shift, emoji still applies to the whole (role + period + shadow) text", () => {
    const event = baseEvent({ category: "shift", role: "technician", period: "night", shadow: true });
    const item = buildCalendarItem(event, SCHEDULE, []);
    expect(item!.summary).toBe("🌙 טכנאי לילה (צל)");
  });

  it("description flags a tentative assignment and an overridden time, omits nothing invented", () => {
    const tentative = baseEvent({ category: "shift", certainty: "tentative" });
    expect(buildCalendarItem(tentative, SCHEDULE, [])!.description).toContain("משוער");

    const confirmed = baseEvent({ category: "shift", certainty: "confirmed" });
    expect(buildCalendarItem(confirmed, SCHEDULE, [])!.description).toBeNull();
  });
});

describe("buildCalendarItem -- shift emoji by period", () => {
  it("day -> sun, night -> moon, morning -> sunrise, unspecified -> no emoji (unreachable via buildCalendarItem itself, checked at the icsEventEmoji level)", () => {
    expect(buildCalendarItem(baseEvent({ period: "day" }), SCHEDULE, [])!.summary.startsWith("☀️")).toBe(true);
    expect(buildCalendarItem(baseEvent({ period: "night" }), SCHEDULE, [])!.summary.startsWith("🌙")).toBe(true);
  });
});

describe("buildCalendarItem -- best-effort COLOR (RFC 7986)", () => {
  it("a day shift gets its semantic color keyword", () => {
    const item = buildCalendarItem(baseEvent({ category: "shift", period: "day" }), SCHEDULE, []);
    expect(item!.color).toBe("goldenrod");
  });

  it("a night shift gets a different keyword than day", () => {
    const item = buildCalendarItem(baseEvent({ category: "shift", period: "night" }), SCHEDULE, []);
    expect(item!.color).toBe("royalblue");
  });

  it("a mapped duty family gets its semantic color", () => {
    const item = buildCalendarItem(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "guard", slot: 1 }),
      SCHEDULE,
      [],
    );
    expect(item!.color).toBe("darkslateblue");
  });

  it("a mapped absence kind gets its semantic color", () => {
    const item = buildCalendarItem(
      baseEvent({ category: "absence", role: null, period: "unspecified", absenceKind: "vacation" }),
      SCHEDULE,
      [],
    );
    expect(item!.color).toBe("seagreen");
  });

  it("reserve and callup duty families share the same semantic color", () => {
    const reserve = buildCalendarItem(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "reserve" }),
      SCHEDULE,
      [],
    );
    const callup = buildCalendarItem(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "callup" }),
      SCHEDULE,
      [],
    );
    expect(reserve!.color).not.toBeNull();
    expect(reserve!.color).toBe(callup!.color);
  });

  it("medical and day_off absence kinds share the same semantic color", () => {
    const medical = buildCalendarItem(
      baseEvent({ category: "absence", role: null, period: "unspecified", absenceKind: "medical" }),
      SCHEDULE,
      [],
    );
    const dayOff = buildCalendarItem(
      baseEvent({ category: "absence", role: null, period: "unspecified", absenceKind: "day_off" }),
      SCHEDULE,
      [],
    );
    expect(medical!.color).not.toBeNull();
    expect(medical!.color).toBe(dayOff!.color);
  });

  it("an unmapped duty family (rasar/oxid) has no color, never a guessed one", () => {
    const rasar = buildCalendarItem(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "rasar" }),
      SCHEDULE,
      [],
    );
    const oxid = buildCalendarItem(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "oxid" }),
      SCHEDULE,
      [],
    );
    expect(rasar!.color).toBeNull();
    expect(oxid!.color).toBeNull();
  });
});

describe("buildCalendarItem -- shift roster in DESCRIPTION", () => {
  it("includes the roster, grouped by role, when colleagues share the same date+period", () => {
    const target = baseEvent();
    const noa = baseEvent({ personId: "p2", personName: "נועה דוגמה", role: "technician", sourceCell: "D15" });
    const item = buildCalendarItem(target, SCHEDULE, [target, noa]);
    expect(item!.description).toBe("איתך במשמרת:\nטכנאים: נועה דוגמה");
  });

  it("omits the roster block entirely (never an empty header) when nobody else is on the shift", () => {
    const target = baseEvent();
    const item = buildCalendarItem(target, SCHEDULE, [target]);
    expect(item!.description).toBeNull();
  });

  it("combines the roster with existing tentative/override/change-note lines, separated by a blank line", () => {
    const target = baseEvent({ certainty: "tentative" });
    const noa = baseEvent({ personId: "p2", personName: "נועה דוגמה", role: "technician", sourceCell: "D15" });
    const item = buildCalendarItem(target, SCHEDULE, [target, noa]);
    expect(item!.description).toBe("משובץ באופן משוער -- טרם אושר סופית\n\nאיתך במשמרת:\nטכנאים: נועה דוגמה");
  });

  it("never leaks a colleague from an unrelated shift (different date) into the description", () => {
    const target = baseEvent();
    const otherDateColleague = baseEvent({
      personId: "p2",
      personName: "נועה דוגמה",
      role: "technician",
      date: "2026-08-20",
      sourceCell: "D16",
    });
    const item = buildCalendarItem(target, SCHEDULE, [target, otherDateColleague]);
    expect(item!.description).toBeNull();
  });

  it("is rebuilt dynamically from allEvents on every call -- removing/reassigning a colleague changes the description", () => {
    const target = baseEvent();
    const noa = baseEvent({ personId: "p2", personName: "נועה דוגמה", role: "technician", sourceCell: "D15" });

    const withNoa = buildCalendarItem(target, SCHEDULE, [target, noa]);
    expect(withNoa!.description).toContain("נועה דוגמה");

    const withoutNoa = buildCalendarItem(target, SCHEDULE, [target]);
    expect(withoutNoa!.description).toBeNull();

    const eitan = baseEvent({ personId: "p3", personName: "איתן דוגמה", role: "technician", sourceCell: "D15" });
    const withEitan = buildCalendarItem(target, SCHEDULE, [target, eitan]);
    expect(withEitan!.description).toContain("איתן דוגמה");
    expect(withEitan!.description).not.toContain("נועה דוגמה");
  });

  it("a roster change alone (adding/removing a colleague) NEVER changes the UID -- only sourceSheet+sourceCell of the target itself does", () => {
    const target = baseEvent();
    const noa = baseEvent({ personId: "p2", personName: "נועה דוגמה", role: "technician", sourceCell: "D15" });

    const withNoa = buildCalendarItem(target, SCHEDULE, [target, noa]);
    const withoutNoa = buildCalendarItem(target, SCHEDULE, [target]);

    expect(withNoa!.uid).toBe(withoutNoa!.uid);
    expect(withNoa!.uid).toBe(calendarEventUid(target));
  });
});

describe("buildCalendarItem -- duty events", () => {
  it("is an all-day item on the event's own date, independent of shiftSchedule", () => {
    const event = baseEvent({ category: "duty", dutyFamily: "guard", slot: 2, role: null, period: "unspecified" });
    const withSchedule = buildCalendarItem(event, SCHEDULE, []);
    const withoutSchedule = buildCalendarItem(event, null, []);
    expect(withSchedule).toEqual(withoutSchedule);
    expect(withSchedule!.timing).toEqual({ kind: "allDay", date: "2026-08-19" });
  });

  it("summary is the duty family label + slot, prefixed with the duty family's emoji", () => {
    const event = baseEvent({ category: "duty", dutyFamily: "guard", slot: 2 });
    expect(buildCalendarItem(event, SCHEDULE, [])!.summary).toBe("🛡️ שמירה 2");
  });

  it("summary omits the slot when the duty family has none, and gets oxid's own emoji prefix", () => {
    const event = baseEvent({ category: "duty", dutyFamily: "oxid", slot: null });
    expect(buildCalendarItem(event, SCHEDULE, [])!.summary).toBe("📄 אוקסיד");
  });

  it("never gets a roster/'who's with me' description, even when another duty Event shares the exact same date+family+slot", () => {
    const event = baseEvent({ category: "duty", dutyFamily: "guard", slot: 1, role: null, period: "unspecified" });
    const anotherGuard = baseEvent({
      category: "duty",
      dutyFamily: "guard",
      slot: 1,
      role: null,
      period: "unspecified",
      personId: "p2",
      personName: "נועה דוגמה",
      sourceCell: "D15",
    });
    const item = buildCalendarItem(event, SCHEDULE, [event, anotherGuard]);
    expect(item!.description).toBeNull();
  });
});

describe("buildCalendarItem -- absence events", () => {
  it("is an all-day item, summary is the absence-kind label prefixed with its emoji", () => {
    const event = baseEvent({ category: "absence", absenceKind: "vacation", role: null, period: "unspecified" });
    const item = buildCalendarItem(event, SCHEDULE, []);
    expect(item!.timing).toEqual({ kind: "allDay", date: "2026-08-19" });
    expect(item!.summary).toBe("🏖️ חופש");
  });

  it("never gets a roster description", () => {
    const event = baseEvent({ category: "absence", absenceKind: "vacation", role: null, period: "unspecified" });
    const someone = baseEvent({ category: "absence", personId: "p2", personName: "נועה דוגמה", sourceCell: "D15" });
    expect(buildCalendarItem(event, SCHEDULE, [event, someone])!.description).toBeNull();
  });

  it("has no emoji prefix for an absence kind with no fitting symbol (medical)", () => {
    const event = baseEvent({ category: "absence", absenceKind: "medical", role: null, period: "unspecified" });
    expect(buildCalendarItem(event, SCHEDULE, [])!.summary).toBe("גימלים");
  });
});
