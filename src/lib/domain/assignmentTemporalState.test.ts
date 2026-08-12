import { describe, expect, it } from "vitest";
import { classifyAssignmentTemporalState, isEventStillRelevant } from "./assignmentTemporalState";
import type { Event } from "./event";
import type { LocalNow } from "./localNow";
import { buildShiftSchedule } from "./shiftSchedule";

// day 07:30-19:30, night 19:30-07:30(+1)
const schedule = buildShiftSchedule("07:30");

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function baseEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_test",
    personName: "דני בדיקה",
    date: "2026-08-12",
    title: "טכנאי יום",
    rawValue: "טכנאי יום",
    category: "shift",
    certainty: "confirmed",
    role: "technician",
    period: "day",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: nextCell(),
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

function shiftEvent(overrides: Partial<Event> = {}): Event {
  return baseEvent({ category: "shift", ...overrides });
}

function dutyEvent(overrides: Partial<Event> = {}): Event {
  return baseEvent({
    category: "duty",
    role: null,
    period: "unspecified",
    dutyFamily: "guard",
    slot: 1,
    title: "שומר 1",
    rawValue: "שומר 1",
    ...overrides,
  });
}

function localNow(overrides: Partial<LocalNow> = {}): LocalNow {
  return { date: "2026-08-12", minuteOfDay: 0, ...overrides };
}

describe("classifyAssignmentTemporalState — day shift", () => {
  it("17. before effective start -> upcoming", () => {
    const event = shiftEvent({ date: "2026-08-12", period: "day" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 6 * 60 + 40 }); // 06:40, before 07:30
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("upcoming");
  });

  it("18. within [start, end) -> current", () => {
    const event = shiftEvent({ date: "2026-08-12", period: "day" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 10 * 60 }); // 10:00
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("current");
  });

  it("19. after effective end -> past", () => {
    const event = shiftEvent({ date: "2026-08-12", period: "day" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 20 * 60 }); // 20:00, after 19:30
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("past");
  });

  it("day shift interval is a half-open [start, end) -- exactly at end minute is past", () => {
    const event = shiftEvent({ date: "2026-08-12", period: "day" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 19 * 60 + 30 });
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("past");
  });
});

describe("classifyAssignmentTemporalState — overnight night shift", () => {
  it("20. previous-date night shift at 02:00 today -> current", () => {
    const event = shiftEvent({ date: "2026-08-11", period: "night" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 }); // 02:00
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("current");
  });

  it("21. previous-date night shift after its end -> past", () => {
    const event = shiftEvent({ date: "2026-08-11", period: "night" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 8 * 60 }); // 08:00, after 07:30
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("past");
  });

  it("22. future night shift -> upcoming", () => {
    const event = shiftEvent({ date: "2026-08-20", period: "night" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 10 * 60 });
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("upcoming");
  });

  it("same-date night shift before its start -> upcoming", () => {
    const event = shiftEvent({ date: "2026-08-12", period: "night" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 10 * 60 }); // 10:00, before 19:30
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("upcoming");
  });

  it("a night shift more than one calendar day in the past is past, not misread via minute math", () => {
    const event = shiftEvent({ date: "2026-08-01", period: "night" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 });
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("past");
  });
});

describe("classifyAssignmentTemporalState — duty", () => {
  it("23. duty dated today is current without inventing hours", () => {
    const event = dutyEvent({ date: "2026-08-12" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 5 }); // very early -- still "current"
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("current");
  });

  it("future-dated duty -> upcoming", () => {
    const event = dutyEvent({ date: "2026-08-20" });
    expect(classifyAssignmentTemporalState(event, schedule, localNow())).toBe("upcoming");
  });

  it("past-dated duty -> past", () => {
    const event = dutyEvent({ date: "2026-08-01" });
    expect(classifyAssignmentTemporalState(event, schedule, localNow())).toBe("past");
  });
});

describe("classifyAssignmentTemporalState — never guesses invalid/unspecified shift timing", () => {
  it("27. unspecified-period shift is not_evaluable regardless of date", () => {
    const today = shiftEvent({ date: "2026-08-12", period: "unspecified", role: null });
    const future = shiftEvent({ date: "2026-08-20", period: "unspecified", role: null });
    const past = shiftEvent({ date: "2026-08-01", period: "unspecified", role: null });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 600 });

    expect(classifyAssignmentTemporalState(today, schedule, now)).toBe("not_evaluable");
    expect(classifyAssignmentTemporalState(future, schedule, now)).toBe("not_evaluable");
    expect(classifyAssignmentTemporalState(past, schedule, now)).toBe("not_evaluable");
  });

  it("an out-of-window start/end override never gets guessed into a bucket either", () => {
    // "עד 23:00" on a day shift (07:30-19:30) does not fall in the window -> invalid.
    const event = shiftEvent({ date: "2026-08-12", period: "day", endTimeOverride: "23:00" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 600 });
    expect(classifyAssignmentTemporalState(event, schedule, now)).toBe("not_evaluable");
  });

  it("a non-assignment category is always not_evaluable", () => {
    const event = baseEvent({ category: "status", period: "unspecified", role: null });
    expect(classifyAssignmentTemporalState(event, schedule, localNow())).toBe("not_evaluable");
  });
});

describe("isEventStillRelevant", () => {
  it("today's and future events are always relevant", () => {
    const now = localNow({ date: "2026-08-12", minuteOfDay: 600 });
    expect(isEventStillRelevant(shiftEvent({ date: "2026-08-12" }), schedule, now)).toBe(true);
    expect(isEventStillRelevant(dutyEvent({ date: "2026-08-20" }), schedule, now)).toBe(true);
  });

  it("33. a still-current overnight shift from yesterday stays relevant after midnight", () => {
    const event = shiftEvent({ date: "2026-08-11", period: "night" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 });
    expect(isEventStillRelevant(event, schedule, now)).toBe(true);
  });

  it("a finished overnight shift from yesterday is no longer relevant", () => {
    const event = shiftEvent({ date: "2026-08-11", period: "night" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 8 * 60 });
    expect(isEventStillRelevant(event, schedule, now)).toBe(false);
  });

  it("a duty from yesterday is never carried forward -- duties have no hours to still be running", () => {
    const event = dutyEvent({ date: "2026-08-11" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 });
    expect(isEventStillRelevant(event, schedule, now)).toBe(false);
  });

  it("an event from two or more days ago is never relevant", () => {
    const event = shiftEvent({ date: "2026-08-01", period: "night" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 });
    expect(isEventStillRelevant(event, schedule, now)).toBe(false);
  });
});
