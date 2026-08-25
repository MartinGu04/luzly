import { describe, expect, it } from "vitest";
import {
  getJerusalemLocalNow,
  jerusalemEndOfDayInstant,
  jerusalemLocalTimeToInstant,
  jerusalemStartOfDayInstant,
} from "./jerusalemClock";

describe("getJerusalemLocalNow", () => {
  it("46. converts a winter (UTC+2, standard time) instant to Jerusalem local date/time", () => {
    // 2026-01-15T10:00:00Z -> Israel Standard Time is UTC+2 in January.
    const result = getJerusalemLocalNow(new Date("2026-01-15T10:00:00.000Z"));
    expect(result).toEqual({ date: "2026-01-15", minuteOfDay: 12 * 60 });
  });

  it("47. converts a summer (UTC+3, DST) instant to Jerusalem local date/time via Intl, not a hard-coded offset", () => {
    // 2026-07-15T10:00:00Z -> Israel Daylight Time is UTC+3 in July.
    const result = getJerusalemLocalNow(new Date("2026-07-15T10:00:00.000Z"));
    expect(result).toEqual({ date: "2026-07-15", minuteOfDay: 13 * 60 });
  });

  it("rolls the calendar date forward when the local time crosses midnight", () => {
    // 2026-01-15T22:30:00Z + 2h -> 2026-01-16T00:30 local.
    const result = getJerusalemLocalNow(new Date("2026-01-15T22:30:00.000Z"));
    expect(result).toEqual({ date: "2026-01-16", minuteOfDay: 30 });
  });

  it("defaults to the current instant when none is provided", () => {
    const result = getJerusalemLocalNow();

    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.minuteOfDay).toBeGreaterThanOrEqual(0);
    expect(result.minuteOfDay).toBeLessThan(24 * 60);
  });
});

describe("jerusalemLocalTimeToInstant", () => {
  it("converts a winter (UTC+2) local time to the correct UTC instant", () => {
    const instant = jerusalemLocalTimeToInstant("2026-01-15", 20, 0);
    expect(instant.toISOString()).toBe("2026-01-15T18:00:00.000Z");
  });

  it("converts a summer (UTC+3, DST) local time to the correct UTC instant", () => {
    const instant = jerusalemLocalTimeToInstant("2026-07-15", 20, 0);
    expect(instant.toISOString()).toBe("2026-07-15T17:00:00.000Z");
  });

  it("round-trips through getJerusalemLocalNow for an arbitrary time", () => {
    const instant = jerusalemLocalTimeToInstant("2026-08-16", 18, 0);
    const roundTripped = getJerusalemLocalNow(instant);
    expect(roundTripped).toEqual({ date: "2026-08-16", minuteOfDay: 18 * 60 });
  });

  it("handles a time that rolls to the next UTC calendar day", () => {
    // 09:00 Jerusalem in August (UTC+3) is 06:00 UTC the same day --
    // check a time close to local midnight instead to actually cross
    // the UTC day boundary.
    const instant = jerusalemLocalTimeToInstant("2026-08-16", 1, 0);
    expect(instant.toISOString()).toBe("2026-08-15T22:00:00.000Z");
  });
});

describe("jerusalemStartOfDayInstant / jerusalemEndOfDayInstant", () => {
  it("start-of-day is winter (UTC+2) midnight Jerusalem", () => {
    expect(jerusalemStartOfDayInstant("2026-01-15").toISOString()).toBe("2026-01-14T22:00:00.000Z");
  });

  it("end-of-day is the last millisecond of the same Jerusalem calendar date, summer (UTC+3)", () => {
    const end = jerusalemEndOfDayInstant("2026-06-29");
    expect(getJerusalemLocalNow(end)).toEqual({ date: "2026-06-29", minuteOfDay: 23 * 60 + 59 });
    expect(end.toISOString()).toBe("2026-06-29T20:59:59.999Z");
  });

  it("end-of-day stays strictly before the next day's start-of-day", () => {
    const end = jerusalemEndOfDayInstant("2026-12-29");
    const nextStart = jerusalemStartOfDayInstant("2026-12-30");
    expect(end.getTime()).toBeLessThan(nextStart.getTime());
    expect(nextStart.getTime() - end.getTime()).toBe(1);
  });
});
