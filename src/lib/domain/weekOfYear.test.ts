import { describe, expect, it } from "vitest";
import { weekOfYear } from "./weekOfYear";

describe("weekOfYear", () => {
  it("January 1st that IS itself a Sunday starts week 1 (2023-01-01 was a Sunday)", () => {
    expect(weekOfYear({ year: 2023, month: 1, day: 1 })).toBe(1);
  });

  it("days before the year's first Sunday fall in week 0 (2024-01-01 was a Monday)", () => {
    expect(weekOfYear({ year: 2024, month: 1, day: 1 })).toBe(0);
    // 2024-01-06 (Saturday) is still the tail of that same partial week.
    expect(weekOfYear({ year: 2024, month: 1, day: 6 })).toBe(0);
  });

  it("the year's first Sunday starts week 1 (2024-01-07 was a Sunday)", () => {
    expect(weekOfYear({ year: 2024, month: 1, day: 7 })).toBe(1);
  });

  it("every date in the same Sunday-Saturday span produces the identical week number", () => {
    // 2024-01-07 (Sun) .. 2024-01-13 (Sat) is one full Sunday-first week.
    const days = [7, 8, 9, 10, 11, 12, 13];
    const weeks = days.map((day) => weekOfYear({ year: 2024, month: 1, day }));
    expect(new Set(weeks).size).toBe(1);
    expect(weeks[0]).toBe(1);
  });

  it("week numbers increase by exactly 1 crossing a Sunday boundary", () => {
    // 2024-01-13 (Sat, week 1) -> 2024-01-14 (Sun, week 2).
    expect(weekOfYear({ year: 2024, month: 1, day: 13 })).toBe(1);
    expect(weekOfYear({ year: 2024, month: 1, day: 14 })).toBe(2);
  });

  describe("year boundaries", () => {
    it("the last day of a year and the first day of the next can land in consecutive weeks (2022-12-31 Sat -> 2023-01-01 Sun)", () => {
      expect(weekOfYear({ year: 2022, month: 12, day: 31 })).toBe(52);
      expect(weekOfYear({ year: 2023, month: 1, day: 1 })).toBe(1);
    });

    it("a leap year's December 31st computes correctly (2024 is a leap year, Dec 31 2024 was a Tuesday)", () => {
      expect(weekOfYear({ year: 2024, month: 12, day: 31 })).toBe(52);
    });

    it("a non-leap year's December 31st computes correctly (2026 is not a leap year)", () => {
      // 2026-01-01 is a Thursday, so 2026-12-31 (365 days later) is also a Thursday.
      expect(weekOfYear({ year: 2026, month: 1, day: 1 })).toBe(0);
      const decWeek = weekOfYear({ year: 2026, month: 12, day: 31 });
      expect(decWeek).toBeGreaterThanOrEqual(52);
      expect(decWeek).toBeLessThanOrEqual(53);
    });
  });
});
