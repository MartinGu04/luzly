import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parseScheduleSheet } from "./schedule";

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

const DANI = syntheticPerson("דני בדיקה");
const NOA = syntheticPerson("נועה דוגמה");
const personnel = [DANI, NOA];

// Two independent date/day blocks side by side. Block 1 (cols 0-5): date,
// day, "דני בדיקה" (+ one blank continuation column), "נועה דוגמה", then a
// "הערות" (notes) column. Block 2 (cols 6-9): its own date/day pair, then
// "דני בדיקה" and "נועה דוגמה" with no continuation column.
const scheduleSheet: RawSheet = {
  name: "משמרות + תורנויות",
  values: [
    ["תאריך", "יום", "דני בדיקה", "", "נועה דוגמה", "הערות", "תאריך", "יום", "דני בדיקה", "נועה דוגמה"],
    ["05/01/2026", "ב", "בוקר", "משימה נוספת ", "", "הערה כלשהי", "10.02.2026", "ג", "לילה", "חופש"],
    ["06/01/2026", "ג", "טקסט לא ידוע", "", "משהו לנועה", "", "", "", "", ""],
  ],
};

describe("parseScheduleSheet", () => {
  const assignments = parseScheduleSheet(scheduleSheet, personnel);

  it("extracts one RawAssignment per non-empty person/date cell", () => {
    expect(assignments).toHaveLength(6);
  });

  it("handles multiple independent date/day blocks in the same sheet", () => {
    const block1Dates = assignments
      .filter((a) => a.personName === DANI.name)
      .map((a) => a.date);
    expect(block1Dates).toEqual(expect.arrayContaining(["2026-01-05", "2026-01-06", "2026-02-10"]));
  });

  it("gives a person two RawAssignments when they own an adjacent continuation column", () => {
    const daniOnJan5 = assignments.filter(
      (a) => a.personName === DANI.name && a.date === "2026-01-05",
    );
    expect(daniOnJan5).toHaveLength(2);
    expect(daniOnJan5.map((a) => a.rawValue)).toEqual(
      expect.arrayContaining(["בוקר", "משימה נוספת "]),
    );
  });

  it("preserves a trailing space in rawValue exactly", () => {
    const continuationAssignment = assignments.find((a) => a.rawValue.startsWith("משימה נוספת"));
    expect(continuationAssignment?.rawValue).toBe("משימה נוספת ");
  });

  it("does not create an assignment for the notes/structural column", () => {
    expect(assignments.some((a) => a.rawValue === "הערה כלשהי")).toBe(false);
  });

  it("preserves unrecognized free text untouched", () => {
    const unknown = assignments.find((a) => a.rawValue === "טקסט לא ידוע");
    expect(unknown).toMatchObject({ personName: DANI.name, date: "2026-01-06" });
  });

  it("does not misattribute a blank cell as an assignment", () => {
    const noaJan5 = assignments.filter(
      (a) => a.personName === NOA.name && a.date === "2026-01-05",
    );
    expect(noaJan5).toHaveLength(0);
  });

  it("correctly separates the second block's own person columns (no continuation column there)", () => {
    const feb10 = assignments.filter((a) => a.date === "2026-02-10");
    expect(feb10).toHaveLength(2);
    expect(feb10).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ personName: DANI.name, rawValue: "לילה" }),
        expect.objectContaining({ personName: NOA.name, rawValue: "חופש" }),
      ]),
    );
  });

  it("normalizes dates without a timezone/day shift", () => {
    expect(assignments.every((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.date))).toBe(true);
    expect(assignments.some((a) => a.date === "2026-02-10")).toBe(true);
  });

  it("records the source sheet and a source cell reference", () => {
    for (const a of assignments) {
      expect(a.sourceSheet).toBe("משמרות + תורנויות");
      expect(a.sourceCell).toMatch(/^[A-Z]+\d+$/);
    }
  });

  it("returns an empty list instead of throwing when there is no date header", () => {
    const emptySheet: RawSheet = { name: "משמרות + תורנויות", values: [["a", "b"]] };
    expect(parseScheduleSheet(emptySheet, personnel)).toEqual([]);
  });
});

// Regression: the real workbook's first block has a blank/whitespace date
// header (only "יום" is labeled), with a notes column right after it and
// then the person columns. Later blocks do label their date column
// "תאריך" explicitly. Cols: [0]="  " (whitespace date header), [1]="יום",
// [2]="הערות", [3]="דני בדיקה", [4]="" (continuation), [5]="נועה דוגמה",
// [6]="תאריך", [7]="יום", [8]="דני בדיקה", [9]="נועה דוגמה".
const blankFirstHeaderSheet: RawSheet = {
  name: "משמרות + תורנויות",
  values: [
    ["  ", "יום", "הערות", "דני בדיקה", "", "נועה דוגמה", "תאריך", "יום", "דני בדיקה", "נועה דוגמה"],
    ["05/01/2026", "ב", "הערה", "בוקר", "משימה", "", "10.02.2026", "ג", "לילה", "חופש"],
  ],
};

describe("parseScheduleSheet — blank/whitespace first date header (real workbook shape)", () => {
  const assignments = parseScheduleSheet(blankFirstHeaderSheet, personnel);

  it("still detects and emits assignments from the first block despite its blank date header", () => {
    const firstBlock = assignments.filter((a) => a.date === "2026-01-05");
    expect(firstBlock.length).toBeGreaterThan(0);
  });

  it("keeps continuation columns working inside the blank-header block", () => {
    const daniJan5 = assignments.filter(
      (a) => a.personName === DANI.name && a.date === "2026-01-05",
    );
    expect(daniJan5.map((a) => a.rawValue)).toEqual(expect.arrayContaining(["בוקר", "משימה"]));
    expect(daniJan5).toHaveLength(2);
  });

  it("still excludes the notes column in the blank-header block", () => {
    expect(assignments.some((a) => a.rawValue === "הערה")).toBe(false);
  });

  it("still detects the later block with an explicit 'תאריך' header", () => {
    const feb10 = assignments.filter((a) => a.date === "2026-02-10");
    expect(feb10).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ personName: DANI.name, rawValue: "לילה" }),
        expect.objectContaining({ personName: NOA.name, rawValue: "חופש" }),
      ]),
    );
  });

  it("does not invent a phantom block from an unrelated blank column with no dates below it", () => {
    // A blank column immediately before an unrelated "יום"-labeled column,
    // with no parseable dates beneath it, must not be treated as a date column.
    const sheet: RawSheet = {
      name: "משמרות + תורנויות",
      values: [
        ["", "יום", "לא רלוונטי", "תאריך", "יום", "דני בדיקה"],
        ["לא תאריך", "ב", "משהו", "05/01/2026", "ב", "בוקר"],
      ],
    };
    const result = parseScheduleSheet(sheet, personnel);
    expect(result).toEqual([{
      personId: DANI.id,
      personName: DANI.name,
      date: "2026-01-05",
      rawValue: "בוקר",
      sourceSheet: "משמרות + תורנויות",
      sourceCell: "F2",
    }]);
  });
});
