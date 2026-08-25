import { describe, expect, it } from "vitest";
import { formatDurationParts, formatDurationUnitsLabel } from "./shootingRangeDuration";

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

describe("formatDurationUnitsLabel", () => {
  it("zero-pads hours/minutes/seconds and gives every number its own explicit Hebrew unit word", () => {
    expect(formatDurationUnitsLabel({ days: 0, hours: 8, minutes: 4, seconds: 7 })).toBe("08 שעות · 04 דקות · 07 שניות");
  });

  it("never renders a bare, unexplained HH:MM:SS-shaped string", () => {
    const label = formatDurationUnitsLabel({ days: 0, hours: 1, minutes: 41, seconds: 4 });
    expect(label).not.toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(label).toContain("שעות");
    expect(label).toContain("דקות");
    expect(label).toContain("שניות");
  });
});
