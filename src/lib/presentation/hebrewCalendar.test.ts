import { describe, expect, it } from "vitest";
import { formatHebrewCalendarDate, formatHebrewMonthRange, getHolidayContext } from "./hebrewCalendar";

describe("formatHebrewCalendarDate", () => {
  it("formats an ordinary date in Hebrew gematriya", () => {
    expect(formatHebrewCalendarDate("2026-08-12")).toBe("כ״ט באב תשפ״ו");
  });

  it("crosses the Tishrei/civil-year boundary correctly", () => {
    // 2026-09-11 is 29 Elul 5786 (the day before Rosh Hashana 5787).
    expect(formatHebrewCalendarDate("2026-09-11")).toBe("כ״ט באלול תשפ״ו");
    // 2026-09-12 is 1 Tishrei 5787 -- the Hebrew year rolls over.
    expect(formatHebrewCalendarDate("2026-09-12")).toBe("א׳ בתשרי תשפ״ז");
  });

  it("renders a leap-year Adar II date distinctly from plain Adar", () => {
    // 5787 is a Hebrew leap year; Purim falls in Adar II.
    expect(formatHebrewCalendarDate("2027-03-23")).toBe("י״ד באדר ב׳ תשפ״ז");
  });

  it("returns null for an unparseable date, never throws", () => {
    expect(formatHebrewCalendarDate("not-a-date")).toBeNull();
    expect(formatHebrewCalendarDate("2026-13-01")).toBeNull();
  });

  it("is deterministic -- repeated calls for the same date agree", () => {
    expect(formatHebrewCalendarDate("2026-08-12")).toBe(formatHebrewCalendarDate("2026-08-12"));
  });
});

describe("getHolidayContext", () => {
  it("returns null on an ordinary weekday", () => {
    expect(getHolidayContext("2026-08-12")).toBeNull();
  });

  it("returns null on a plain Shabbat with no other holiday", () => {
    expect(getHolidayContext("2026-08-15")).toBeNull();
  });

  it("distinguishes Erev Rosh Hashana from Rosh Hashana itself", () => {
    expect(getHolidayContext("2026-09-11")).toEqual({ emoji: "🍎", label: "ערב ראש השנה" });
    expect(getHolidayContext("2026-09-12")).toEqual({ emoji: "🍎", label: "ראש השנה" });
  });

  it("maps Yom Kippur and its eve", () => {
    expect(getHolidayContext("2026-09-20")).toEqual({ emoji: "🤍", label: "ערב יום כיפור" });
    expect(getHolidayContext("2026-09-21")).toEqual({ emoji: "🤍", label: "יום כיפור" });
  });

  it("maps Sukkot", () => {
    expect(getHolidayContext("2026-09-26")).toEqual({ emoji: "🌿", label: "סוכות" });
  });

  it("maps the Israel-combined Shmini Atzeret/Simchat Torah day", () => {
    expect(getHolidayContext("2026-10-03")).toEqual({ emoji: "📜", label: "שמחת תורה" });
  });

  it("maps every day of Chanukah", () => {
    expect(getHolidayContext("2026-12-08")).toEqual({ emoji: "🕎", label: "חנוכה" });
  });

  it("maps Purim (a leap-year Adar II date)", () => {
    expect(getHolidayContext("2027-03-23")).toEqual({ emoji: "🎭", label: "פורים" });
  });

  it("maps Pesach", () => {
    expect(getHolidayContext("2027-04-22")).toEqual({ emoji: "🍷", label: "פסח" });
  });

  it("maps Shavuot", () => {
    expect(getHolidayContext("2027-06-11")).toEqual({ emoji: "🌾", label: "שבועות" });
  });

  it("maps Yom HaAtzma'ut", () => {
    expect(getHolidayContext("2026-04-22")).toEqual({ emoji: "🇮🇱", label: "יום העצמאות" });
  });

  it("never shows Rosh Chodesh as a holiday", () => {
    // Rosh Chodesh Sivan 5787 -- no other holiday overlaps this date.
    expect(getHolidayContext("2027-06-06")).toBeNull();
  });

  it("never shows a minor fast like Yom Kippur Katan or Ta'anit Esther as a holiday", () => {
    // Yom Kippur Katan Elul falls the day before this ordinary-weekday check above already covers,
    // but Ta'anit Esther (the day before Purim, distinct from Erev Purim itself) must also stay hidden.
    expect(getHolidayContext("2027-03-22")).toEqual({ emoji: "🎭", label: "ערב פורים" });
  });

  it("returns null for an unparseable date, never throws", () => {
    expect(getHolidayContext("not-a-date")).toBeNull();
  });
});

describe("formatHebrewMonthRange", () => {
  it("spans two Hebrew months within the same Hebrew year", () => {
    expect(formatHebrewMonthRange(2026, 8)).toBe("אב–אלול תשפ״ו");
  });

  it("collapses to a single Hebrew month when the whole Gregorian month sits inside it", () => {
    // February 2025 (1st through 28th) falls entirely within Shvat 5785.
    expect(formatHebrewMonthRange(2025, 2)).toBe("שבט תשפ״ה");
  });

  it("returns null when the Gregorian month crosses a Hebrew year boundary (around Rosh Hashana)", () => {
    // September 2026 runs from Elul 5786 into Tishrei 5787.
    expect(formatHebrewMonthRange(2026, 9)).toBeNull();
  });

  it("returns null for an out-of-range month", () => {
    expect(formatHebrewMonthRange(2026, 0)).toBeNull();
    expect(formatHebrewMonthRange(2026, 13)).toBeNull();
  });

  it("is deterministic", () => {
    expect(formatHebrewMonthRange(2026, 8)).toBe(formatHebrewMonthRange(2026, 8));
  });
});
