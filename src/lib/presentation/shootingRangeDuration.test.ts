import { describe, expect, it } from "vitest";
import { formatClockPart, formatDurationParts } from "./shootingRangeDuration";

describe("formatDurationParts", () => {
  it("breaks a duration into days/hours/minutes/seconds", () => {
    const ms = 2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000 + 5_000;
    expect(formatDurationParts(ms)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  it("clamps negative durations to zero", () => {
    expect(formatDurationParts(-1000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("floors sub-second remainders", () => {
    expect(formatDurationParts(1999)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
  });
});

describe("formatClockPart", () => {
  it("zero-pads hours/minutes/seconds", () => {
    expect(formatClockPart({ days: 0, hours: 8, minutes: 4, seconds: 7 })).toBe("08:04:07");
  });
});
