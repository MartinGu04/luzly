import { describe, expect, it } from "vitest";
import type { Event } from "./event";
import type { LocalNow } from "./localNow";
import {
  ShiftConfigurationError,
  buildShiftSchedule,
  nextShiftPeriod,
  previousShiftPeriod,
  resolveCurrentShiftPeriod,
  resolveEventShiftInterval,
  type ShiftSchedule,
} from "./shiftSchedule";

function shiftEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_test",
    personName: "דני בדיקה",
    date: "2026-01-05",
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

describe("buildShiftSchedule", () => {
  it("1. configured day start 07:30 derives 07:30–19:30 as the day window", () => {
    const schedule = buildShiftSchedule("07:30");
    expect(schedule.dayStartMinute).toBe(7 * 60 + 30);
    expect(schedule.dayEndMinute).toBe(19 * 60 + 30);
  });

  it("2. derived night shift is 19:30–07:30 the next day", () => {
    const schedule = buildShiftSchedule("07:30");
    expect(schedule.nightStartMinute).toBe(19 * 60 + 30);
    expect(schedule.nightEndMinute).toBe(24 * 60 + 7 * 60 + 30);
  });

  it("3. accepts HH:mm configuration", () => {
    expect(() => buildShiftSchedule("06:00")).not.toThrow();
    expect(buildShiftSchedule("06:00").dayStartMinute).toBe(360);
  });

  it("4. accepts HH:mm:ss configuration", () => {
    const schedule = buildShiftSchedule("07:30:00");
    expect(schedule.dayStartMinute).toBe(450);
  });

  it("5. rejects invalid configured time instead of falling back to 07:30", () => {
    expect(() => buildShiftSchedule("99:99")).toThrow(ShiftConfigurationError);
    expect(() => buildShiftSchedule("25:00")).toThrow(ShiftConfigurationError);
    expect(() => buildShiftSchedule("not a time")).toThrow(ShiftConfigurationError);
    expect(() => buildShiftSchedule("")).toThrow(ShiftConfigurationError);
    expect(() => buildShiftSchedule(null)).toThrow(ShiftConfigurationError);
    expect(() => buildShiftSchedule(undefined)).toThrow(ShiftConfigurationError);
  });

  it("a schedule configured much later in the day still derives consistently", () => {
    const schedule = buildShiftSchedule("20:00");
    expect(schedule).toEqual<ShiftSchedule>({
      dayStartMinute: 1200,
      dayEndMinute: 1920,
      nightStartMinute: 1920,
      nightEndMinute: 2640,
    });
  });
});

describe("resolveEventShiftInterval", () => {
  const schedule = buildShiftSchedule("07:30");

  it("resolves a plain day shift to the configured day window", () => {
    const result = resolveEventShiftInterval(shiftEvent({ period: "day" }), schedule);
    expect(result).toEqual({ status: "resolved", interval: { startMinute: 450, endMinute: 1170 } });
  });

  it("resolves a plain night shift to the derived night window", () => {
    const result = resolveEventShiftInterval(shiftEvent({ period: "night" }), schedule);
    expect(result).toEqual({ status: "resolved", interval: { startMinute: 1170, endMinute: 1890 } });
  });

  it('"טכנאי יום עד 12" resolves to 07:30–12:00', () => {
    const result = resolveEventShiftInterval(
      shiftEvent({ period: "day", endTimeOverride: "12:00" }),
      schedule,
    );
    expect(result).toEqual({ status: "resolved", interval: { startMinute: 450, endMinute: 720 } });
  });

  it('"טכנאי יום מ-12" resolves to 12:00–19:30', () => {
    const result = resolveEventShiftInterval(
      shiftEvent({ period: "day", startTimeOverride: "12:00" }),
      schedule,
    );
    expect(result).toEqual({ status: "resolved", interval: { startMinute: 720, endMinute: 1170 } });
  });

  it("27. a night override of 00:00 maps to the midnight AFTER the shift begins, not before", () => {
    const result = resolveEventShiftInterval(
      shiftEvent({ period: "night", startTimeOverride: "00:00" }),
      schedule,
    );
    expect(result).toEqual({
      status: "resolved",
      interval: { startMinute: 24 * 60, endMinute: 1890 },
    });
  });

  it("does not silently accept an override outside the canonical shift window", () => {
    // 20:00 doesn't fall inside the 07:30-19:30 day window on any nearby day.
    const result = resolveEventShiftInterval(
      shiftEvent({ period: "day", startTimeOverride: "20:00" }),
      schedule,
    );
    expect(result).toEqual({ status: "invalid" });
  });

  it("28. an invalid 99:99 override does not produce a usable interval", () => {
    const result = resolveEventShiftInterval(
      shiftEvent({ period: "day", startTimeOverride: "99:99" }),
      schedule,
    );
    expect(result).toEqual({ status: "invalid" });
  });

  it("29. an invalid 25:00 override does not produce a usable interval", () => {
    const result = resolveEventShiftInterval(
      shiftEvent({ period: "day", endTimeOverride: "25:00" }),
      schedule,
    );
    expect(result).toEqual({ status: "invalid" });
  });

  it("30. an invalid 12:99 override does not produce a usable interval", () => {
    const result = resolveEventShiftInterval(
      shiftEvent({ period: "day", startTimeOverride: "12:99" }),
      schedule,
    );
    expect(result).toEqual({ status: "invalid" });
  });

  it("an invalid override never falls back to a normal full shift", () => {
    const result = resolveEventShiftInterval(
      shiftEvent({ period: "day", startTimeOverride: "99:99" }),
      schedule,
    );
    expect(result.status).not.toBe("resolved");
  });

  it("safely handles an unspecified period as not_evaluable, never guessing day or night", () => {
    const result = resolveEventShiftInterval(shiftEvent({ period: "unspecified" }), schedule);
    expect(result).toEqual({ status: "not_evaluable" });
  });

  it("32. safely rejects a non-shift Event as not_applicable, never throwing", () => {
    const dutyEvent = shiftEvent({ category: "duty", role: null, period: "unspecified" });
    expect(() => resolveEventShiftInterval(dutyEvent, schedule)).not.toThrow();
    expect(resolveEventShiftInterval(dutyEvent, schedule)).toEqual({ status: "not_applicable" });
  });

  it("33. does not mutate the Event passed in", () => {
    const event = Object.freeze(shiftEvent({ period: "day", endTimeOverride: "12:00" }));
    expect(() => resolveEventShiftInterval(event, schedule)).not.toThrow();
    expect(event.endTimeOverride).toBe("12:00");
  });
});

describe("previousShiftPeriod / nextShiftPeriod", () => {
  it("a night shift's previous is the same date's day shift", () => {
    expect(previousShiftPeriod("2026-08-12", "night")).toEqual({ date: "2026-08-12", period: "day" });
  });

  it("a day shift's previous is the PREVIOUS date's night shift -- crosses the calendar-date boundary", () => {
    expect(previousShiftPeriod("2026-08-12", "day")).toEqual({ date: "2026-08-11", period: "night" });
  });

  it("a day shift's next is the same date's night shift", () => {
    expect(nextShiftPeriod("2026-08-12", "day")).toEqual({ date: "2026-08-12", period: "night" });
  });

  it("a night shift's next is the FOLLOWING date's day shift -- crosses the calendar-date boundary", () => {
    expect(nextShiftPeriod("2026-08-12", "night")).toEqual({ date: "2026-08-13", period: "day" });
  });

  it("crosses a month boundary correctly", () => {
    expect(previousShiftPeriod("2026-09-01", "day")).toEqual({ date: "2026-08-31", period: "night" });
    expect(nextShiftPeriod("2026-08-31", "night")).toEqual({ date: "2026-09-01", period: "day" });
  });

  it("crosses a year boundary correctly", () => {
    expect(previousShiftPeriod("2027-01-01", "day")).toEqual({ date: "2026-12-31", period: "night" });
  });

  it("morning has no canonical adjacency -- never guessed", () => {
    expect(previousShiftPeriod("2026-08-12", "morning")).toBeNull();
    expect(nextShiftPeriod("2026-08-12", "morning")).toBeNull();
  });

  it("unspecified has no canonical adjacency -- never guessed", () => {
    expect(previousShiftPeriod("2026-08-12", "unspecified")).toBeNull();
    expect(nextShiftPeriod("2026-08-12", "unspecified")).toBeNull();
  });

  it("previousShiftPeriod and nextShiftPeriod are exact inverses of one another", () => {
    const next = nextShiftPeriod("2026-08-12", "day");
    expect(next).not.toBeNull();
    if (next) {
      expect(previousShiftPeriod(next.date, next.period)).toEqual({ date: "2026-08-12", period: "day" });
    }
  });
});

describe("resolveCurrentShiftPeriod", () => {
  const schedule = buildShiftSchedule("07:30"); // day 07:30-19:30, night 19:30-07:30(+1)

  function now(date: string, minuteOfDay: number): LocalNow {
    return { date, minuteOfDay };
  }

  it("mid-morning is today's day shift", () => {
    expect(resolveCurrentShiftPeriod(now("2026-08-12", 10 * 60), schedule)).toEqual({
      date: "2026-08-12",
      period: "day",
    });
  });

  it("exactly at the day-start boundary is already today's day shift", () => {
    expect(resolveCurrentShiftPeriod(now("2026-08-12", 7 * 60 + 30), schedule)).toEqual({
      date: "2026-08-12",
      period: "day",
    });
  });

  it("one minute before the day-start boundary is still yesterday's night shift", () => {
    expect(resolveCurrentShiftPeriod(now("2026-08-12", 7 * 60 + 29), schedule)).toEqual({
      date: "2026-08-11",
      period: "night",
    });
  });

  it("late evening is today's night shift", () => {
    expect(resolveCurrentShiftPeriod(now("2026-08-12", 21 * 60), schedule)).toEqual({
      date: "2026-08-12",
      period: "night",
    });
  });

  it("exactly at the night-start boundary is already today's night shift", () => {
    expect(resolveCurrentShiftPeriod(now("2026-08-12", 19 * 60 + 30), schedule)).toEqual({
      date: "2026-08-12",
      period: "night",
    });
  });

  it("just after midnight is still yesterday's night shift, crossing the calendar-date boundary", () => {
    expect(resolveCurrentShiftPeriod(now("2026-08-12", 2 * 60), schedule)).toEqual({
      date: "2026-08-11",
      period: "night",
    });
  });

  it("crosses a month boundary correctly", () => {
    expect(resolveCurrentShiftPeriod(now("2026-09-01", 2 * 60), schedule)).toEqual({
      date: "2026-08-31",
      period: "night",
    });
  });

  it("crosses a year boundary correctly", () => {
    expect(resolveCurrentShiftPeriod(now("2027-01-01", 2 * 60), schedule)).toEqual({
      date: "2026-12-31",
      period: "night",
    });
  });

  it("a day-start configured well after noon is still handled correctly (today's day shift wraps into tomorrow)", () => {
    const lateSchedule = buildShiftSchedule("15:00"); // day 15:00-03:00(+1), night 03:00-15:00(+1)
    // 08:20 today falls inside YESTERDAY's night shift (03:00 today - 15:00 today).
    expect(resolveCurrentShiftPeriod(now("2026-08-12", 8 * 60 + 20), lateSchedule)).toEqual({
      date: "2026-08-11",
      period: "night",
    });
    // 16:00 today falls inside TODAY's day shift (15:00 today - 03:00 tomorrow).
    expect(resolveCurrentShiftPeriod(now("2026-08-12", 16 * 60), lateSchedule)).toEqual({
      date: "2026-08-12",
      period: "day",
    });
  });

  it("is consistent with resolveEventShiftInterval: `now` always falls inside the returned shift's own resolved interval", () => {
    const current = resolveCurrentShiftPeriod(now("2026-08-12", 21 * 60), schedule);
    const event: Event = {
      personId: "p_test",
      personName: "דני בדיקה",
      date: current.date,
      title: "x",
      rawValue: "x",
      category: "shift",
      certainty: "confirmed",
      role: "technician",
      period: current.period,
      sourceSheet: "s",
      sourceCell: "A1",
      slot: null,
      shadow: false,
      startTimeOverride: null,
      endTimeOverride: null,
      changeNote: null,
      dutyFamily: null,
      absenceKind: null,
    };
    const resolution = resolveEventShiftInterval(event, schedule);
    expect(resolution.status).toBe("resolved");
    if (resolution.status === "resolved") {
      // 21:00 on 2026-08-12, expressed on `current.date`'s own timeline (same date here).
      expect(resolution.interval.startMinute).toBeLessThanOrEqual(21 * 60);
      expect(resolution.interval.endMinute).toBeGreaterThan(21 * 60);
    }
  });
});
