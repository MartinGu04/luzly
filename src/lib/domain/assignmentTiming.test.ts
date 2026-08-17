import { describe, expect, it } from "vitest";
import { computeAssignmentTiming, computeIntervalTiming } from "./assignmentTiming";
import type { Event } from "./event";
import type { LocalNow } from "./localNow";
import { buildShiftSchedule } from "./shiftSchedule";

// day 07:30-19:30, night 19:30-07:30(+1)
const schedule = buildShiftSchedule("07:30");

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
    sourceCell: "C2",
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

function localNow(overrides: Partial<LocalNow> = {}): LocalNow {
  return { date: "2026-08-12", minuteOfDay: 0, ...overrides };
}

describe("computeAssignmentTiming — resolved day shift", () => {
  it("15. currently-running shift reports server-resolved elapsed/remaining/progress", () => {
    const event = baseEvent({ date: "2026-08-12", period: "day" }); // 07:30-19:30
    const now = localNow({ date: "2026-08-12", minuteOfDay: 8 * 60 }); // 08:00 -> 30 min in
    const timing = computeAssignmentTiming(event, schedule, now);
    expect(timing).toEqual({
      status: "resolved",
      startLocalTime: "07:30",
      endLocalTime: "19:30",
      durationMinutes: 720,
      elapsedMinutesAtLoad: 30,
      remainingMinutesAtLoad: 690,
      progressPercentAtLoad: 4,
      minutesUntilStartAtLoad: 0,
    });
  });

  it("a shift starting later today reports a live minutesUntilStartAtLoad countdown, no elapsed progress", () => {
    const event = baseEvent({ date: "2026-08-12", period: "day" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 6 * 60 + 30 }); // 06:30, 60 min before start
    const timing = computeAssignmentTiming(event, schedule, now);
    expect(timing.status).toBe("resolved");
    if (timing.status === "resolved") {
      expect(timing.elapsedMinutesAtLoad).toBe(0);
      expect(timing.progressPercentAtLoad).toBe(0);
      expect(timing.minutesUntilStartAtLoad).toBe(60);
    }
  });

  it("a finished shift reports full elapsed/100% progress and zero remaining", () => {
    const event = baseEvent({ date: "2026-08-12", period: "day" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 20 * 60 }); // 20:00, after 19:30
    const timing = computeAssignmentTiming(event, schedule, now);
    expect(timing.status).toBe("resolved");
    if (timing.status === "resolved") {
      expect(timing.elapsedMinutesAtLoad).toBe(720);
      expect(timing.remainingMinutesAtLoad).toBe(0);
      expect(timing.progressPercentAtLoad).toBe(100);
    }
  });
});

describe("computeAssignmentTiming — overnight night shift", () => {
  it("17. overnight resolved timing displays 19:30 -> 07:30 correctly across midnight", () => {
    const event = baseEvent({ date: "2026-08-11", period: "night" }); // 19:30 -> 07:30(+1)
    const now = localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 }); // 02:00 -- mid-shift
    const timing = computeAssignmentTiming(event, schedule, now);
    expect(timing.status).toBe("resolved");
    if (timing.status === "resolved") {
      expect(timing.startLocalTime).toBe("19:30");
      expect(timing.endLocalTime).toBe("07:30");
      expect(timing.durationMinutes).toBe(720);
      // 19:30 -> 02:00 is 6h30m = 390 minutes elapsed.
      expect(timing.elapsedMinutesAtLoad).toBe(390);
      expect(timing.remainingMinutesAtLoad).toBe(330);
    }
  });

  it("a night shift starting later today counts down correctly", () => {
    const event = baseEvent({ date: "2026-08-12", period: "night" }); // starts 19:30
    const now = localNow({ date: "2026-08-12", minuteOfDay: 18 * 60 }); // 18:00, 90 min before start
    const timing = computeAssignmentTiming(event, schedule, now);
    expect(timing.status).toBe("resolved");
    if (timing.status === "resolved") {
      expect(timing.minutesUntilStartAtLoad).toBe(90);
      expect(timing.elapsedMinutesAtLoad).toBe(0);
    }
  });
});

describe("computeAssignmentTiming — partial overrides", () => {
  it("16. a partial start-time override displays correctly", () => {
    const event = baseEvent({ date: "2026-08-12", period: "day", startTimeOverride: "10:00" });
    const now = localNow({ date: "2026-08-12", minuteOfDay: 11 * 60 }); // 11:00 -> 60 min in
    const timing = computeAssignmentTiming(event, schedule, now);
    expect(timing.status).toBe("resolved");
    if (timing.status === "resolved") {
      expect(timing.startLocalTime).toBe("10:00");
      expect(timing.endLocalTime).toBe("19:30");
      expect(timing.durationMinutes).toBe(9 * 60 + 30);
      expect(timing.elapsedMinutesAtLoad).toBe(60);
    }
  });

  it("a partial end-time override displays correctly", () => {
    const event = baseEvent({ date: "2026-08-12", period: "day", endTimeOverride: "14:00" });
    const timing = computeAssignmentTiming(event, schedule, localNow({ minuteOfDay: 8 * 60 }));
    expect(timing.status).toBe("resolved");
    if (timing.status === "resolved") {
      expect(timing.startLocalTime).toBe("07:30");
      expect(timing.endLocalTime).toBe("14:00");
    }
  });
});

describe("computeAssignmentTiming — never invents timing", () => {
  it("18. unspecified-period shift is always not_evaluable, never a guessed interval", () => {
    const event = baseEvent({ date: "2026-08-12", period: "unspecified", role: null });
    expect(computeAssignmentTiming(event, schedule, localNow())).toEqual({ status: "not_evaluable" });
  });

  it("an invalid out-of-window override is not_evaluable", () => {
    const event = baseEvent({ date: "2026-08-12", period: "day", endTimeOverride: "23:00" });
    expect(computeAssignmentTiming(event, schedule, localNow())).toEqual({ status: "not_evaluable" });
  });

  it("a duty Event is always not_evaluable -- no invented hourly duration", () => {
    const event = baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "guard" });
    expect(computeAssignmentTiming(event, schedule, localNow())).toEqual({ status: "not_evaluable" });
  });

  it("a shift more than a day in the future has no live countdown, only full remaining duration", () => {
    const event = baseEvent({ date: "2026-08-20", period: "day" });
    const timing = computeAssignmentTiming(event, schedule, localNow({ date: "2026-08-12" }));
    expect(timing.status).toBe("resolved");
    if (timing.status === "resolved") {
      expect(timing.minutesUntilStartAtLoad).toBe(0);
      expect(timing.elapsedMinutesAtLoad).toBe(0);
      expect(timing.remainingMinutesAtLoad).toBe(timing.durationMinutes);
    }
  });

  it("a shift more than a day in the past is reported as fully elapsed", () => {
    const event = baseEvent({ date: "2026-08-01", period: "day" });
    const timing = computeAssignmentTiming(event, schedule, localNow({ date: "2026-08-12" }));
    expect(timing.status).toBe("resolved");
    if (timing.status === "resolved") {
      expect(timing.elapsedMinutesAtLoad).toBe(timing.durationMinutes);
      expect(timing.remainingMinutesAtLoad).toBe(0);
    }
  });
});

describe("computeIntervalTiming", () => {
  it("produces identical output to computeAssignmentTiming for the same resolved interval/date/now", () => {
    const event = baseEvent({ date: "2026-08-12", period: "day" }); // 07:30-19:30
    const now = localNow({ date: "2026-08-12", minuteOfDay: 8 * 60 });
    const viaEvent = computeAssignmentTiming(event, schedule, now);
    const viaInterval = computeIntervalTiming({ startMinute: 450, endMinute: 1170 }, "2026-08-12", now);
    expect(viaInterval).toEqual(viaEvent);
  });

  it("computes live elapsed/remaining/percent for a canonical interval with no Event at all", () => {
    const timing = computeIntervalTiming(
      { startMinute: 450, endMinute: 1170 },
      "2026-08-12",
      localNow({ date: "2026-08-12", minuteOfDay: 8 * 60 }),
    );
    expect(timing).toEqual({
      status: "resolved",
      startLocalTime: "07:30",
      endLocalTime: "19:30",
      durationMinutes: 720,
      elapsedMinutesAtLoad: 30,
      remainingMinutesAtLoad: 690,
      progressPercentAtLoad: 4,
      minutesUntilStartAtLoad: 0,
    });
  });

  it("handles an overnight interval crossing midnight the same way computeAssignmentTiming does", () => {
    const timing = computeIntervalTiming(
      { startMinute: 1170, endMinute: 1890 }, // 19:30 -> 07:30(+1)
      "2026-08-11",
      localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 }), // 02:00, mid-shift
    );
    expect(timing.status).toBe("resolved");
    if (timing.status === "resolved") {
      expect(timing.elapsedMinutesAtLoad).toBe(390);
      expect(timing.remainingMinutesAtLoad).toBe(330);
    }
  });
});
