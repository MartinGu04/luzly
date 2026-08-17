import { describe, expect, it } from "vitest";
import { parseSourcePeriodYear, SHEET_SOURCES } from "./sheetSources";

describe("parseSourcePeriodYear", () => {
  it("parses the trailing year from the real configured H1/H2 source names", () => {
    expect(parseSourcePeriodYear(SHEET_SOURCES.potentialH1)).toBe(2026);
    expect(parseSourcePeriodYear(SHEET_SOURCES.potentialH2)).toBe(2026);
  });

  it("parses a generic '.../M-M/YYYY' shaped name", () => {
    expect(parseSourcePeriodYear('פוטנציאל תקש"אס 1-6/2030')).toBe(2030);
    expect(parseSourcePeriodYear('פוטנציאל תקש"אס 7-12/1999')).toBe(1999);
  });

  it("returns null for a name with no trailing 4-digit year -- never a guessed/default year", () => {
    expect(parseSourcePeriodYear('פוטנציאל תקש"אס')).toBeNull();
    expect(parseSourcePeriodYear("")).toBeNull();
    expect(parseSourcePeriodYear("משמרות + תורנויות")).toBeNull();
  });

  it("requires exactly 4 digits after the final slash -- a 2-digit or 5-digit trailing number is not a year", () => {
    expect(parseSourcePeriodYear("1-6/26")).toBeNull();
    expect(parseSourcePeriodYear("1-6/20261")).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseSourcePeriodYear("  1-6/2026  ")).toBe(2026);
  });
});
