import { describe, expect, it } from "vitest";
import type { LocalNow } from "./localNow";
import {
  addCalendarDays,
  formatCalendarDate,
  parseManagerRangeParam,
  resolveManagerDateRange,
  subtractCalendarDays,
} from "./dateRange";

function localNow(date: string): LocalNow {
  return { date, minuteOfDay: 600 };
}

describe("parseManagerRangeParam", () => {
  it("accepts every valid key", () => {
    expect(parseManagerRangeParam("today")).toBe("today");
    expect(parseManagerRangeParam("7d")).toBe("7d");
    expect(parseManagerRangeParam("30d")).toBe("30d");
    expect(parseManagerRangeParam("month")).toBe("month");
  });

  it("falls back to 7d for an invalid value", () => {
    expect(parseManagerRangeParam("14d")).toBe("7d");
    expect(parseManagerRangeParam("")).toBe("7d");
    expect(parseManagerRangeParam("<script>")).toBe("7d");
  });

  it("falls back to 7d when missing", () => {
    expect(parseManagerRangeParam(null)).toBe("7d");
    expect(parseManagerRangeParam(undefined)).toBe("7d");
  });
});

describe("addCalendarDays", () => {
  it("stays within the same month", () => {
    expect(addCalendarDays({ year: 2026, month: 8, day: 10 }, 3)).toEqual({ year: 2026, month: 8, day: 13 });
  });

  it("rolls over a month boundary", () => {
    expect(addCalendarDays({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 1 });
  });

  it("rolls over a year boundary", () => {
    expect(addCalendarDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it("handles leap-year February correctly", () => {
    // 2028 is a leap year -- Feb has 29 days.
    expect(addCalendarDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
    expect(addCalendarDays({ year: 2028, month: 2, day: 29 }, 1)).toEqual({ year: 2028, month: 3, day: 1 });
  });

  it("treats a non-leap year February correctly", () => {
    expect(addCalendarDays({ year: 2026, month: 2, day: 28 }, 1)).toEqual({ year: 2026, month: 3, day: 1 });
  });

  it("handles a jump spanning several months", () => {
    expect(addCalendarDays({ year: 2026, month: 1, day: 20 }, 29)).toEqual({ year: 2026, month: 2, day: 18 });
  });

  it("n=0 is a no-op", () => {
    expect(addCalendarDays({ year: 2026, month: 8, day: 13 }, 0)).toEqual({ year: 2026, month: 8, day: 13 });
  });
});

describe("subtractCalendarDays", () => {
  it("stays within the same month", () => {
    expect(subtractCalendarDays({ year: 2026, month: 8, day: 13 }, 3)).toEqual({ year: 2026, month: 8, day: 10 });
  });

  it("rolls backward over a month boundary", () => {
    expect(subtractCalendarDays({ year: 2026, month: 2, day: 1 }, 1)).toEqual({ year: 2026, month: 1, day: 31 });
  });

  it("rolls backward over a year boundary", () => {
    expect(subtractCalendarDays({ year: 2027, month: 1, day: 1 }, 1)).toEqual({ year: 2026, month: 12, day: 31 });
  });

  it("handles leap-year February correctly", () => {
    expect(subtractCalendarDays({ year: 2028, month: 3, day: 1 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("handles a non-leap year February correctly", () => {
    expect(subtractCalendarDays({ year: 2026, month: 3, day: 1 }, 1)).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it("n=0 is a no-op", () => {
    expect(subtractCalendarDays({ year: 2026, month: 8, day: 13 }, 0)).toEqual({ year: 2026, month: 8, day: 13 });
  });

  it("is the exact inverse of addCalendarDays over a jump spanning several months", () => {
    const start = { year: 2026, month: 1, day: 20 };
    const forward = addCalendarDays(start, 29);
    expect(subtractCalendarDays(forward, 29)).toEqual(start);
  });
});

describe("formatCalendarDate", () => {
  it("pads month/day to two digits", () => {
    expect(formatCalendarDate({ year: 2026, month: 1, day: 5 })).toBe("2026-01-05");
  });
});

describe("resolveManagerDateRange", () => {
  it("today: exactly one date, localNow.date itself", () => {
    const range = resolveManagerDateRange("today", null, localNow("2026-08-13"));
    expect(range.dates).toEqual(["2026-08-13"]);
    expect(range.startDate).toBe("2026-08-13");
    expect(range.endDate).toBe("2026-08-13");
    expect(range.month).toBeNull();
  });

  it("7d: today plus the next 6 civil dates, 7 total", () => {
    const range = resolveManagerDateRange("7d", null, localNow("2026-08-13"));
    expect(range.dates).toHaveLength(7);
    expect(range.dates[0]).toBe("2026-08-13");
    expect(range.dates[6]).toBe("2026-08-19");
  });

  it("30d: today plus the next 29 civil dates, 30 total", () => {
    const range = resolveManagerDateRange("30d", null, localNow("2026-08-13"));
    expect(range.dates).toHaveLength(30);
    expect(range.dates[0]).toBe("2026-08-13");
    expect(range.dates[29]).toBe("2026-09-11");
  });

  it("30d crossing a year boundary", () => {
    const range = resolveManagerDateRange("30d", null, localNow("2026-12-20"));
    expect(range.dates[0]).toBe("2026-12-20");
    expect(range.dates[29]).toBe("2027-01-18");
  });

  it("month: defaults to the month containing localNow.date when no param given", () => {
    const range = resolveManagerDateRange("month", null, localNow("2026-08-13"));
    expect(range.month).toEqual({ year: 2026, month: 8 });
    expect(range.startDate).toBe("2026-08-01");
    expect(range.endDate).toBe("2026-08-31");
    expect(range.dates).toHaveLength(31);
  });

  it("month: honors a valid explicit YYYY-MM param", () => {
    const range = resolveManagerDateRange("month", "2026-02", localNow("2026-08-13"));
    expect(range.month).toEqual({ year: 2026, month: 2 });
    expect(range.dates).toHaveLength(28); // 2026 is not a leap year
  });

  it("month: leap-year February has 29 days", () => {
    const range = resolveManagerDateRange("month", "2028-02", localNow("2026-08-13"));
    expect(range.dates).toHaveLength(29);
    expect(range.endDate).toBe("2028-02-29");
  });

  it("month: an invalid YYYY-MM falls back to the month containing localNow.date", () => {
    const range = resolveManagerDateRange("month", "not-a-month", localNow("2026-08-13"));
    expect(range.month).toEqual({ year: 2026, month: 8 });
  });

  it("month: December end-of-year month resolves cleanly", () => {
    const range = resolveManagerDateRange("month", "2026-12", localNow("2026-08-13"));
    expect(range.startDate).toBe("2026-12-01");
    expect(range.endDate).toBe("2026-12-31");
  });

  it("never touches Date/UTC -- dates are exact civil strings regardless of runtime TZ", () => {
    const range = resolveManagerDateRange("7d", null, localNow("2026-08-13"));
    for (const date of range.dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
