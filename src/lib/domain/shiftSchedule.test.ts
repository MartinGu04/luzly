import { describe, expect, it } from "vitest";
import type { Event } from "./event";
import {
  ShiftConfigurationError,
  buildShiftSchedule,
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
