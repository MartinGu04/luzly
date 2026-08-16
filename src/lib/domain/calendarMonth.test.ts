import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  daysInCalendarMonth,
  firstWeekdayOfCalendarMonth,
  formatMonthParam,
  isWeekendColumn,
  parseMonthParam,
  shiftCalendarMonth,
} from "./calendarMonth";

describe("daysInCalendarMonth", () => {
  it("handles a leap-year February", () => {
    expect(daysInCalendarMonth(2024, 2)).toBe(29);
  });

  it("handles a non-leap-year February", () => {
    expect(daysInCalendarMonth(2026, 2)).toBe(28);
  });

  it("handles a century year that is not a leap year (2100, divisible by 100 but not 400)", () => {
    expect(daysInCalendarMonth(2100, 2)).toBe(28);
  });

  it("handles a century year that IS a leap year (2000, divisible by 400)", () => {
    expect(daysInCalendarMonth(2000, 2)).toBe(29);
  });

  it("handles a 31-day month and a 30-day month", () => {
    expect(daysInCalendarMonth(2026, 8)).toBe(31);
    expect(daysInCalendarMonth(2026, 9)).toBe(30);
  });
});

describe("parseMonthParam", () => {
  it("parses a well-formed YYYY-MM", () => {
    expect(parseMonthParam("2026-08")).toEqual({ year: 2026, month: 8 });
  });

  it("falls back (returns null) for an out-of-range month", () => {
    expect(parseMonthParam("2026-13")).toBeNull();
    expect(parseMonthParam("2026-00")).toBeNull();
  });

  it("falls back (returns null) for garbage input", () => {
    expect(parseMonthParam("not-a-month")).toBeNull();
    expect(parseMonthParam("2026-08-12")).toBeNull();
    expect(parseMonthParam("2026/08")).toBeNull();
  });

  it("falls back (returns null) for missing input", () => {
    expect(parseMonthParam(null)).toBeNull();
    expect(parseMonthParam(undefined)).toBeNull();
    expect(parseMonthParam("")).toBeNull();
  });
});

describe("formatMonthParam", () => {
  it("is the exact inverse of parseMonthParam for a valid month", () => {
    expect(formatMonthParam({ year: 2026, month: 8 })).toBe("2026-08");
    expect(parseMonthParam(formatMonthParam({ year: 2026, month: 1 }))).toEqual({ year: 2026, month: 1 });
  });
});

describe("shiftCalendarMonth", () => {
  it("moves forward within the same year", () => {
    expect(shiftCalendarMonth({ year: 2026, month: 8 }, 1)).toEqual({ year: 2026, month: 9 });
  });

  it("moves backward within the same year", () => {
    expect(shiftCalendarMonth({ year: 2026, month: 8 }, -1)).toEqual({ year: 2026, month: 7 });
  });

  it("rolls the year over December -> January", () => {
    expect(shiftCalendarMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("rolls the year over January -> December", () => {
    expect(shiftCalendarMonth({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
  });

  it("handles a multi-month jump crossing a year boundary", () => {
    expect(shiftCalendarMonth({ year: 2026, month: 11 }, 3)).toEqual({ year: 2027, month: 2 });
  });
});

describe("firstWeekdayOfCalendarMonth", () => {
  it("returns the correct 0(Sun)-6(Sat) weekday for a known month start", () => {
    // 2026-08-01 is a Saturday.
    expect(firstWeekdayOfCalendarMonth(2026, 8)).toBe(6);
    // 2026-09-01 is a Tuesday.
    expect(firstWeekdayOfCalendarMonth(2026, 9)).toBe(2);
  });
});

describe("buildMonthGrid", () => {
  it("is Sunday-first: the correct number of leading (out-of-month) cells before day 1", () => {
    // 2026-08-01 is a Saturday (weekday 6) -- 6 leading cells before "2026-08-01".
    const grid = buildMonthGrid(2026, 8);
    expect(grid.slice(0, 6).every((cell) => cell.inMonth === false)).toBe(true);
    expect(grid[6]).toEqual({ date: "2026-08-01", inMonth: true });
  });

  it("is ALWAYS exactly 42 cells (6 complete weeks), regardless of month length/weekday alignment", () => {
    for (const [year, month] of [[2026, 8], [2026, 2], [2024, 2], [2027, 2], [2026, 11], [2026, 9]] as const) {
      const grid = buildMonthGrid(year, month);
      expect(grid.length).toBe(42);
    }
  });

  it("contains every day of the month exactly once, in order, marked inMonth: true", () => {
    const grid = buildMonthGrid(2026, 8);
    const dates = grid.filter((cell) => cell.inMonth).map((cell) => cell.date);
    expect(dates).toHaveLength(31);
    expect(dates[0]).toBe("2026-08-01");
    expect(dates[dates.length - 1]).toBe("2026-08-31");
    expect(dates).toEqual([...dates].sort());
  });

  it("pads leading/trailing cells with the REAL adjacent month's dates, never null/blank", () => {
    const grid = buildMonthGrid(2026, 8);
    for (const cell of grid) {
      expect(cell.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // 31 days + 6 leading = 37; padded up to exactly 42 with real September dates.
    expect(grid.length).toBe(42);
    expect(grid[grid.length - 1]).toEqual({ date: "2026-09-05", inMonth: false });
  });

  it("leading padding uses the correct real PREVIOUS month dates (July 2026, ending 31st)", () => {
    const grid = buildMonthGrid(2026, 8);
    expect(grid.slice(0, 6)).toEqual([
      { date: "2026-07-26", inMonth: false },
      { date: "2026-07-27", inMonth: false },
      { date: "2026-07-28", inMonth: false },
      { date: "2026-07-29", inMonth: false },
      { date: "2026-07-30", inMonth: false },
      { date: "2026-07-31", inMonth: false },
    ]);
  });

  it("handles a leap-year February with the correct day count", () => {
    const grid = buildMonthGrid(2024, 2);
    const dates = grid.filter((cell) => cell.inMonth).map((cell) => cell.date);
    expect(dates).toHaveLength(29);
    expect(dates[dates.length - 1]).toBe("2024-02-29");
    expect(grid.length).toBe(42);
  });

  it("a month requiring no leading padding at all (starts on Sunday) still pads to 42 with real next-month dates", () => {
    // 2026-11-01 is a Sunday.
    const grid = buildMonthGrid(2026, 11);
    expect(grid[0]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(grid.length).toBe(42);
    expect(grid[grid.length - 1].inMonth).toBe(false);
  });

  it("December's next-month padding correctly rolls the year over to January", () => {
    const grid = buildMonthGrid(2026, 12);
    const trailing = grid.filter((cell) => !cell.inMonth && cell.date > "2026-12-31");
    for (const cell of trailing) {
      expect(cell.date.startsWith("2027-01")).toBe(true);
    }
  });
});

describe("isWeekendColumn", () => {
  it("treats Sunday through Wednesday (columns 0-3) as weekdays", () => {
    expect(isWeekendColumn(0)).toBe(false);
    expect(isWeekendColumn(1)).toBe(false);
    expect(isWeekendColumn(2)).toBe(false);
    expect(isWeekendColumn(3)).toBe(false);
  });

  it("treats Thursday, Friday, and Saturday (columns 4-6) as the weekend", () => {
    expect(isWeekendColumn(4)).toBe(true);
    expect(isWeekendColumn(5)).toBe(true);
    expect(isWeekendColumn(6)).toBe(true);
  });
});
