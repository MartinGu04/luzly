import { describe, expect, it } from "vitest";
import { getNextOperationalWeek, getOperationalWeek, nextCalendarDateString } from "./operationalWeek";
import type { LocalNow } from "./localNow";

function localNow(date: string): LocalNow {
  return { date, minuteOfDay: 0 };
}

describe("getOperationalWeek", () => {
  it("resolves a mid-week Wednesday to its Sunday-based week", () => {
    // 2026-08-19 is a Wednesday.
    const week = getOperationalWeek(localNow("2026-08-19"));
    expect(week.weekStart).toBe("2026-08-16"); // the preceding Sunday
    expect(week.weekEnd).toBe("2026-08-22");
    expect(week.dates).toEqual([
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
  });

  it("a Sunday itself is the start of its own week", () => {
    const week = getOperationalWeek(localNow("2026-08-16"));
    expect(week.weekStart).toBe("2026-08-16");
  });

  it("a Saturday is the end of its own week", () => {
    const week = getOperationalWeek(localNow("2026-08-22"));
    expect(week.weekStart).toBe("2026-08-16");
    expect(week.weekEnd).toBe("2026-08-22");
  });

  it("correctly rolls across a month boundary", () => {
    // 2026-08-31 is a Monday.
    const week = getOperationalWeek(localNow("2026-08-31"));
    expect(week.weekStart).toBe("2026-08-30");
    expect(week.weekEnd).toBe("2026-09-05");
  });
});

describe("getNextOperationalWeek", () => {
  it("returns the week immediately after the given one", () => {
    const week = getOperationalWeek(localNow("2026-08-19"));
    const next = getNextOperationalWeek(week);
    expect(next.weekStart).toBe("2026-08-23");
    expect(next.weekEnd).toBe("2026-08-29");
  });
});

describe("nextCalendarDateString", () => {
  it("returns the following calendar date", () => {
    expect(nextCalendarDateString("2026-08-19")).toBe("2026-08-20");
  });

  it("rolls across a month/year boundary", () => {
    expect(nextCalendarDateString("2026-12-31")).toBe("2027-01-01");
  });

  it("returns null for an unparseable date", () => {
    expect(nextCalendarDateString("not-a-date")).toBeNull();
  });
});
