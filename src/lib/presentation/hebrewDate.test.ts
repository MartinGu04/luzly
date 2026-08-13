import { describe, expect, it } from "vitest";
import {
  formatCompactDate,
  formatDateRange,
  formatHebrewMonthYear,
  formatHebrewWeekday,
  formatHebrewWeekdayAndDate,
  formatShortWeekday,
  relativeDayLabel,
  SHORT_WEEKDAY_LABELS,
} from "./hebrewDate";

describe("formatHebrewWeekdayAndDate", () => {
  it("formats a known date correctly (2026-08-12 is a Wednesday)", () => {
    expect(formatHebrewWeekdayAndDate("2026-08-12")).toBe("יום רביעי · 12 באוגוסט");
  });

  it("formats a different month correctly", () => {
    expect(formatHebrewWeekdayAndDate("2026-01-01")).toBe("יום חמישי · 1 בינואר");
  });

  it("returns null for an unparseable date, never throws", () => {
    expect(formatHebrewWeekdayAndDate("not-a-date")).toBeNull();
    expect(formatHebrewWeekdayAndDate("2026-13-01")).toBeNull();
  });
});

describe("formatHebrewWeekday", () => {
  it("returns just the weekday label", () => {
    expect(formatHebrewWeekday("2026-08-13")).toBe("יום חמישי");
  });
});

describe("formatShortWeekday", () => {
  it("formats the standard single-letter abbreviation", () => {
    expect(formatShortWeekday("2026-08-13")).toBe("ה׳"); // Thursday
  });

  it("returns null for an invalid date", () => {
    expect(formatShortWeekday("bad")).toBeNull();
  });
});

describe("formatCompactDate", () => {
  it("formats day.month compactly", () => {
    expect(formatCompactDate("2026-08-13")).toBe("13.8");
  });

  it("returns null for an invalid date", () => {
    expect(formatCompactDate("bad")).toBeNull();
  });
});

describe("formatHebrewMonthYear", () => {
  it("formats a month/year header label", () => {
    expect(formatHebrewMonthYear(2026, 8)).toBe("אוגוסט 2026");
  });

  it("returns null for an out-of-range month", () => {
    expect(formatHebrewMonthYear(2026, 0)).toBeNull();
    expect(formatHebrewMonthYear(2026, 13)).toBeNull();
  });
});

describe("formatDateRange", () => {
  it("formats a single day as a full weekday+date", () => {
    expect(formatDateRange("2026-08-19", "2026-08-19")).toBe("יום רביעי · 19 באוגוסט");
  });

  it("formats a multi-day range within the same month compactly", () => {
    expect(formatDateRange("2026-08-19", "2026-08-21")).toBe("19–21 באוגוסט");
  });

  it("formats a range crossing a Gregorian month with both months named", () => {
    expect(formatDateRange("2026-08-31", "2026-09-02")).toBe("31 באוגוסט – 2 בספטמבר");
  });

  it("formats a range crossing a year boundary", () => {
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30 בדצמבר – 2 בינואר");
  });

  it("returns null for an unparseable date, never throws", () => {
    expect(formatDateRange("not-a-date", "2026-08-21")).toBeNull();
    expect(formatDateRange("2026-08-19", "bad")).toBeNull();
  });
});

describe("SHORT_WEEKDAY_LABELS", () => {
  it("is Sunday-first with 7 entries, matching dayOfWeek's 0=Sunday convention", () => {
    expect(SHORT_WEEKDAY_LABELS).toHaveLength(7);
    expect(SHORT_WEEKDAY_LABELS[0]).toBe("א׳");
    expect(SHORT_WEEKDAY_LABELS[6]).toBe("ש׳");
  });
});

describe("relativeDayLabel", () => {
  it("recognizes today", () => {
    expect(relativeDayLabel("2026-08-12", "2026-08-12")).toBe("today");
  });

  it("recognizes tomorrow", () => {
    expect(relativeDayLabel("2026-08-13", "2026-08-12")).toBe("tomorrow");
  });

  it("recognizes a month-boundary tomorrow", () => {
    expect(relativeDayLabel("2026-09-01", "2026-08-31")).toBe("tomorrow");
  });

  it("everything else is other", () => {
    expect(relativeDayLabel("2026-08-20", "2026-08-12")).toBe("other");
    expect(relativeDayLabel("2026-08-11", "2026-08-12")).toBe("other");
  });
});
