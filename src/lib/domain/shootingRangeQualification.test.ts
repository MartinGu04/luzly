import { describe, expect, it } from "vitest";
import {
  addCalendarMonths,
  classifyQualificationStatus,
  computeQualificationExpiryDate,
} from "./shootingRangeQualification";

describe("addCalendarMonths", () => {
  it("adds a plain 6-month span with no month-end edge case", () => {
    expect(addCalendarMonths({ year: 2026, month: 6, day: 29 }, 6)).toEqual({ year: 2026, month: 12, day: 29 });
  });

  it("rolls the year forward when the month overflows December", () => {
    expect(addCalendarMonths({ year: 2026, month: 8, day: 10 }, 6)).toEqual({ year: 2027, month: 2, day: 10 });
  });

  it("clamps Aug 31 + 6 months to Feb 28 in a non-leap year", () => {
    expect(addCalendarMonths({ year: 2026, month: 8, day: 31 }, 6)).toEqual({ year: 2027, month: 2, day: 28 });
  });

  it("clamps Aug 31 + 6 months to Feb 29 in a leap year", () => {
    expect(addCalendarMonths({ year: 2027, month: 8, day: 31 }, 6)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("clamps Jan 31 + 1 month to Feb 28 (non-leap)", () => {
    expect(addCalendarMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it("clamps Jan 31 + 1 month to Feb 29 (leap year)", () => {
    expect(addCalendarMonths({ year: 2028, month: 1, day: 31 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("supports negative months (rolling the year backward)", () => {
    expect(addCalendarMonths({ year: 2026, month: 2, day: 15 }, -6)).toEqual({ year: 2025, month: 8, day: 15 });
  });
});

describe("computeQualificationExpiryDate", () => {
  it("29/06/2026 completion -> expiry 29/12/2026 (spec example)", () => {
    expect(computeQualificationExpiryDate("2026-06-29")).toBe("2026-12-29");
  });

  it("returns null for an unparseable performedOn -- never a guessed expiry", () => {
    expect(computeQualificationExpiryDate("")).toBeNull();
    expect(computeQualificationExpiryDate("not-a-date")).toBeNull();
  });

  it("never uses fixed 180-day arithmetic -- 31 Aug completion expires the LAST day of February, not day 180", () => {
    expect(computeQualificationExpiryDate("2026-08-31")).toBe("2027-02-28");
    expect(computeQualificationExpiryDate("2027-08-31")).toBe("2028-02-29"); // leap year
  });
});

describe("classifyQualificationStatus", () => {
  it("valid through the end of the expiry calendar day (spec example: valid through 29/12, invalid starting 30/12)", () => {
    expect(classifyQualificationStatus("2026-12-29", "2026-11-01")).toBe("valid");
    expect(classifyQualificationStatus("2026-12-29", "2026-12-29")).not.toBe("expired");
    expect(classifyQualificationStatus("2026-12-29", "2026-12-30")).toBe("expired");
  });

  it("classifies expiring_soon at <= 30 days and expiring_very_soon at <= 7 days, most-urgent first", () => {
    expect(classifyQualificationStatus("2026-12-29", "2026-11-28")).toBe("valid"); // 31 days out
    expect(classifyQualificationStatus("2026-12-29", "2026-12-05")).toBe("expiring_soon"); // 24 days out
    expect(classifyQualificationStatus("2026-12-29", "2026-12-22")).toBe("expiring_very_soon"); // 7 days out
    expect(classifyQualificationStatus("2026-12-29", "2026-12-29")).toBe("expiring_very_soon"); // 0 days out, still valid
  });

  it("30-day boundary is inclusive", () => {
    expect(classifyQualificationStatus("2026-12-30", "2026-11-30")).toBe("expiring_soon"); // exactly 30 days out
  });

  it("returns none when there is no expiry date at all -- never fabricated", () => {
    expect(classifyQualificationStatus(null, "2026-06-01")).toBe("none");
  });

  it("counts up correctly past expiry (used to render 'expired N days ago')", () => {
    expect(classifyQualificationStatus("2026-12-29", "2027-01-04")).toBe("expired");
  });
});
