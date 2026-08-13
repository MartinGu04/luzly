import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parsePotentialSheet } from "./potential";

function syntheticPerson(name: string): Person {
  return {
    id: `id_${name}`,
    name,
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
  };
}

const MARTIN = syntheticPerson("מרטין בדיקה");
const EITAN = syntheticPerson("איתן דוגמה");
const personnel = [MARTIN, EITAN];

/**
 * Synthetic H1-shaped fixture: date + day columns, two requirement
 * columns ("כונן פינויים", "מטבח"), then a fairness/scoring side-table
 * sharing the same header row (שם, הקצאה, ניקוד הפוטנציאל הקודם, ניקוד
 * לפוטנציאל הנוכחי, סופ"שים, פטורים). Purely synthetic — never real
 * operational/personnel data.
 */
const h1Sheet: RawSheet = {
  name: 'פוטנציאל תקש"אס 1-6/2026',
  values: [
    [
      "תאריך",
      "יום",
      "כונן פינויים",
      "מטבח",
      "שם",
      "הקצאה",
      "ניקוד הפוטנציאל הקודם",
      "ניקוד לפוטנציאל הנוכחי",
      'סופ"שים',
      "פטורים",
    ],
    ["23/08/2026", "א", "מרטין בדיקה", "יחידה א", "מרטין בדיקה", "5", "12", "14", "3", "1"],
    ["24/08/2026", "ב", "", "יחידה ב", "איתן דוגמה", "4", "10", "11", "2", "0"],
    ["not-a-date", "ג", "מרטין בדיקה", "", "", "", "", "", "", ""],
  ],
};

/**
 * Synthetic H2-shaped fixture: structurally different from H1 -- no
 * adjacent "יום" day column (date column inferred purely from parseable
 * dates below it), different requirement columns ("רס\"ר", "אוקסיד"),
 * and a smaller fairness side-table (only שם + סופ"שים present). Proves
 * the parser tolerates H1/H2 shape differences rather than hardcoding one
 * fixed layout.
 */
const h2Sheet: RawSheet = {
  name: 'פוטנציאל תקש"אס 7-12/2026',
  values: [
    ["תאריך", 'רס"ר', "אוקסיד", "שם", 'סופ"שים'],
    ["01/09/2026", "איתן דוגמה", "יחידה ג", "איתן דוגמה", "6"],
    ["02/09/2026", "", "", "מרטין בדיקה", "5"],
  ],
};

describe("parsePotentialSheet — H1 shape", () => {
  const allocations = parsePotentialSheet(h1Sheet, personnel);

  it("extracts one allocation per non-empty operational cell", () => {
    // row1: 2 cells (כונן פינויים, מטבח); row2: 1 cell (מטבח only); row3: malformed date -> skipped entirely.
    expect(allocations).toHaveLength(3);
  });

  it("resolves a cell that exactly matches a known person's name", () => {
    const named = allocations.find((a) => a.columnLabel === "כונן פינויים" && a.date === "2026-08-23");
    expect(named?.resolvedPersonId).toBe(MARTIN.id);
    expect(named?.rawValue).toBe("מרטין בדיקה");
  });

  it("keeps an organizational/source label as a label, never a guessed person", () => {
    const label = allocations.find((a) => a.columnLabel === "מטבח" && a.date === "2026-08-23");
    expect(label?.rawValue).toBe("יחידה א");
    expect(label?.resolvedPersonId).toBeNull();
  });

  it("skips a blank allocation cell entirely (no fabricated empty row)", () => {
    const missing = allocations.find((a) => a.columnLabel === "כונן פינויים" && a.date === "2026-08-24");
    expect(missing).toBeUndefined();
  });

  it("skips a malformed/unparseable date row without crashing", () => {
    expect(allocations.some((a) => a.rawValue === "מרטין בדיקה" && a.date === "not-a-date")).toBe(false);
  });

  it("carries sourceSheet/sourceCell for internal traceability", () => {
    const named = allocations.find((a) => a.columnLabel === "כונן פינויים" && a.date === "2026-08-23");
    expect(named?.sourceSheet).toBe(h1Sheet.name);
    expect(named?.sourceCell).toBe("C2");
  });

  it("preserves deterministic top-to-bottom, left-to-right ordering", () => {
    expect(allocations.map((a) => `${a.date}:${a.columnLabel}`)).toEqual([
      "2026-08-23:כונן פינויים",
      "2026-08-23:מטבח",
      "2026-08-24:מטבח",
    ]);
  });
});

describe("parsePotentialSheet — fairness side-table exclusion", () => {
  const allocations = parsePotentialSheet(h1Sheet, personnel);

  it("never produces an allocation from the fairness/scoring columns", () => {
    const fairnessLabels = new Set([
      "שם",
      "הקצאה",
      "ניקוד הפוטנציאל הקודם",
      "ניקוד לפוטנציאל הנוכחי",
      'סופ"שים',
      "פטורים",
    ]);
    for (const allocation of allocations) {
      expect(fairnessLabels.has(allocation.columnLabel)).toBe(false);
    }
  });

  it("never leaks a raw fairness score value anywhere in the output", () => {
    const rawValues = allocations.map((a) => a.rawValue);
    // The fairness row's numeric scores (12, 14, 3, 1, 10, 11, 2, 0) must never appear as an allocation rawValue.
    expect(rawValues).not.toContain("12");
    expect(rawValues).not.toContain("14");
    expect(rawValues).not.toContain("10");
  });

  it("only recognizes requirement columns strictly left of the fairness boundary", () => {
    const labels = new Set(allocations.map((a) => a.columnLabel));
    expect(labels).toEqual(new Set(["כונן פינויים", "מטבח"]));
  });
});

describe("parsePotentialSheet — H2 shape (no day column, smaller fairness table)", () => {
  const allocations = parsePotentialSheet(h2Sheet, personnel);

  it("infers the date column without an explicit adjacent day header", () => {
    expect(allocations.some((a) => a.date === "2026-09-01")).toBe(true);
  });

  it("extracts allocations for its own distinct requirement columns", () => {
    const labels = new Set(allocations.map((a) => a.columnLabel));
    expect(labels).toEqual(new Set(['רס"ר', "אוקסיד"]));
  });

  it("resolves a named-person allocation", () => {
    const named = allocations.find((a) => a.columnLabel === 'רס"ר');
    expect(named?.resolvedPersonId).toBe(EITAN.id);
  });

  it("excludes the smaller two-column fairness table too", () => {
    const labels = new Set(allocations.map((a) => a.columnLabel));
    expect(labels.has("שם")).toBe(false);
    expect(labels.has('סופ"שים')).toBe(false);
  });

  it("never leaks the fairness column's raw values (5, 6) as allocations", () => {
    expect(allocations.some((a) => a.rawValue === "6")).toBe(false);
  });
});

describe("parsePotentialSheet — structural edge cases", () => {
  it("returns an empty array for a sheet with no recognizable date/day header", () => {
    const sheet: RawSheet = { name: "empty", values: [["הערות", "משהו"], ["x", "y"]] };
    expect(parsePotentialSheet(sheet, personnel)).toEqual([]);
  });

  it("returns an empty array when every allocation column has a blank header", () => {
    const sheet: RawSheet = {
      name: "blank-headers",
      values: [["תאריך", "יום", "", ""], ["23/08/2026", "א", "מרטין בדיקה", "יחידה א"]],
    };
    expect(parsePotentialSheet(sheet, personnel)).toEqual([]);
  });

  it("does not crash on a completely empty sheet", () => {
    const sheet: RawSheet = { name: "totally-empty", values: [] };
    expect(parsePotentialSheet(sheet, personnel)).toEqual([]);
  });

  it("is pure -- calling it twice with the same input gives the same result", () => {
    expect(parsePotentialSheet(h1Sheet, personnel)).toEqual(parsePotentialSheet(h1Sheet, personnel));
  });

  it("never mutates the input sheet", () => {
    const before = JSON.stringify(h1Sheet);
    parsePotentialSheet(h1Sheet, personnel);
    expect(JSON.stringify(h1Sheet)).toBe(before);
  });
});
