import { describe, expect, it } from "vitest";
import { formatMinuteInterval, formatMissingIntervals, formatScheduleMinute } from "./scheduleTime";

describe("formatScheduleMinute", () => {
  it("formats an ordinary daytime minute", () => {
    expect(formatScheduleMinute(450)).toBe("07:30");
  });

  it("formats an evening minute", () => {
    expect(formatScheduleMinute(1170)).toBe("19:30");
  });

  it("wraps exactly 1440 (midnight of the next day) to 00:00", () => {
    expect(formatScheduleMinute(1440)).toBe("00:00");
  });

  it("wraps a minute past 1440 correctly", () => {
    expect(formatScheduleMinute(1530)).toBe("01:30");
  });

  it("pads single-digit hours and minutes to two digits", () => {
    expect(formatScheduleMinute(65)).toBe("01:05");
    expect(formatScheduleMinute(0)).toBe("00:00");
  });

  it("formats the last minute of a day", () => {
    expect(formatScheduleMinute(1439)).toBe("23:59");
  });
});

describe("formatMinuteInterval", () => {
  it("formats an ordinary daytime interval", () => {
    expect(formatMinuteInterval({ startMinute: 330, endMinute: 450 })).toBe("05:30–07:30");
  });

  it("formats an overnight interval crossing midnight (>1440 end)", () => {
    expect(formatMinuteInterval({ startMinute: 1410, endMinute: 1470 })).toBe("23:30–00:30");
  });

  it("never merges/recomputes -- renders the exact given start/end even if the interval looks unusual", () => {
    expect(formatMinuteInterval({ startMinute: 0, endMinute: 1440 })).toBe("00:00–00:00");
  });
});

describe("formatMissingIntervals", () => {
  it("formats a single gap", () => {
    expect(formatMissingIntervals([{ startMinute: 330, endMinute: 450 }])).toEqual(["05:30–07:30"]);
  });

  it("preserves the order of multiple gaps -- never re-sorts", () => {
    const intervals = [
      { startMinute: 1170, endMinute: 1230 },
      { startMinute: 330, endMinute: 450 },
    ];
    expect(formatMissingIntervals(intervals)).toEqual(["19:30–20:30", "05:30–07:30"]);
  });

  it("returns an empty array for no intervals -- never fabricates a gap", () => {
    expect(formatMissingIntervals([])).toEqual([]);
  });
});
