import { describe, expect, it } from "vitest";
import { getJerusalemLocalNow } from "./jerusalemClock";

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
