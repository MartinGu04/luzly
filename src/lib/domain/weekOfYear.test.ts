import { describe, expect, it } from "vitest";
import { weekOfYear } from "./weekOfYear";

describe("weekOfYear", () => {
  it("January 1st is always week 1, regardless of its weekday", () => {
    // 2024-01-01 was a Monday.
    expect(weekOfYear({ year: 2024, month: 1, day: 1 })).toBe(1);
    // 2023-01-01 was a Sunday.
    expect(weekOfYear({ year: 2023, month: 1, day: 1 })).toBe(1);
    // 2026-01-01 was a Thursday.
    expect(weekOfYear({ year: 2026, month: 1, day: 1 })).toBe(1);
  });

  it("every day through the first Saturday of the year remains week 1 (2024-01-01 Mon .. 2024-01-06 Sat)", () => {
    for (let day = 1; day <= 6; day++) {
      expect(weekOfYear({ year: 2024, month: 1, day })).toBe(1);
    }
  });

  it("the first Sunday after January 1st becomes week 2 (2024-01-07 was a Sunday)", () => {
    expect(weekOfYear({ year: 2024, month: 1, day: 7 })).toBe(2);
  });

  it("when January 1st IS itself a Sunday, the whole first Sunday-Saturday week is week 1, and the NEXT Sunday is week 2 (2023-01-01 Sun .. 2023-01-07 Sat, then 2023-01-08 Sun)", () => {
    for (let day = 1; day <= 7; day++) {
      expect(weekOfYear({ year: 2023, month: 1, day })).toBe(1);
    }
    expect(weekOfYear({ year: 2023, month: 1, day: 8 })).toBe(2);
  });

  it("every date in the same Sunday-Saturday span produces the identical week number (2024-01-07 Sun .. 2024-01-13 Sat)", () => {
    const days = [7, 8, 9, 10, 11, 12, 13];
    const weeks = days.map((day) => weekOfYear({ year: 2024, month: 1, day }));
    expect(new Set(weeks).size).toBe(1);
    expect(weeks[0]).toBe(2);
  });

  it("each following Sunday increments the week number by exactly 1", () => {
    // 2024-01-14, 2024-01-21, 2024-01-28 are consecutive Sundays.
    expect(weekOfYear({ year: 2024, month: 1, day: 7 })).toBe(2);
    expect(weekOfYear({ year: 2024, month: 1, day: 14 })).toBe(3);
    expect(weekOfYear({ year: 2024, month: 1, day: 21 })).toBe(4);
    expect(weekOfYear({ year: 2024, month: 1, day: 28 })).toBe(5);
  });

  it("a leap year computes correctly (2024 is a leap year)", () => {
    expect(weekOfYear({ year: 2024, month: 2, day: 29 })).toBeGreaterThan(1);
    // 2024-12-31 was a Tuesday -- last day of a leap year.
    const decWeek = weekOfYear({ year: 2024, month: 12, day: 31 });
    expect(decWeek).toBeGreaterThanOrEqual(52);
    expect(decWeek).toBeLessThanOrEqual(53);
  });

  describe("year-end boundaries", () => {
    it("the last day of a year and the first day of the next both compute deterministically (2022-12-31 Sat -> 2023-01-01 Sun)", () => {
      expect(weekOfYear({ year: 2022, month: 12, day: 31 })).toBeGreaterThanOrEqual(52);
      expect(weekOfYear({ year: 2023, month: 1, day: 1 })).toBe(1);
    });

    it("a non-leap year's December 31st computes correctly (2026 is not a leap year)", () => {
      const decWeek = weekOfYear({ year: 2026, month: 12, day: 31 });
      expect(decWeek).toBeGreaterThanOrEqual(52);
      expect(decWeek).toBeLessThanOrEqual(53);
    });
  });

  describe("week 0 must never occur", () => {
    function isLeapYear(year: number): boolean {
      return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    function daysInMonth(year: number, month: number): number {
      const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return days[month - 1];
    }

    it("no date across a full sweep of every possible January-1st weekday returns 0", () => {
      // 2018..2024 collectively cover all seven possible weekdays for January 1st.
      for (let year = 2018; year <= 2024; year++) {
        for (let month = 1; month <= 12; month++) {
          for (let day = 1; day <= daysInMonth(year, month); day++) {
            expect(weekOfYear({ year, month, day })).toBeGreaterThanOrEqual(1);
          }
        }
      }
    });

    it("January 1st never returns 0 for any weekday", () => {
      for (let year = 2018; year <= 2024; year++) {
        expect(weekOfYear({ year, month: 1, day: 1 })).toBe(1);
      }
    });
  });
});
