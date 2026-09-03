import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parseFairnessTable } from "./fairness";

function syntheticPerson(name: string, overrides: Partial<Person> = {}): Person {
  return {
    id: `id_${name}`,
    name,
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    dischargeDate: null,
    enlistmentDate: null,
    ...overrides,
  };
}

const MARTIN = syntheticPerson("מרטין בדיקה");
const EITAN = syntheticPerson("איתן דוגמה");
const NOA = syntheticPerson("נועה עובדת");
const personnel = [MARTIN, EITAN, NOA];

const FAIRNESS_HEADER = [
  "שם",
  "הקצאה",
  "ניקוד הפוטנציאל הקודם",
  "ניקוד לפוטנציאל הנוכחי",
  'סופ"שים',
  "פטורים",
];

/** Left-pads a fairness table so it sits far right of column A, mirroring the real workbook's ~W:AB placement without hard-coding it as schema. */
function pad(n: number): string[] {
  return Array.from({ length: n }, () => "");
}

const LEFT_PAD = 22; // arbitrary -- proves the parser locates by header text, not a fixed column.

interface FairnessRowInput {
  name: string;
  allocation: string;
  previous: string;
  current: string;
  weekends: string;
  exemptions: string;
}

function fairnessRow(input: FairnessRowInput): string[] {
  return [...pad(LEFT_PAD), input.name, input.allocation, input.previous, input.current, input.weekends, input.exemptions];
}

function buildFairnessSheet(options: {
  name: string;
  rows: FairnessRowInput[];
  totalRow?: string[];
  targetNoteRows?: string[][];
  title?: boolean;
}): RawSheet {
  const values: string[][] = [];
  if (options.title) values.push([...pad(LEFT_PAD), "טבלת צדק - 1-6/2026"]);
  values.push([...pad(LEFT_PAD), ...FAIRNESS_HEADER]);
  for (const row of options.rows) values.push(fairnessRow(row));
  if (options.totalRow) values.push(options.totalRow);
  if (options.targetNoteRows) values.push(...options.targetNoteRows);
  return { name: options.name, values };
}

const STANDARD_ROWS: FairnessRowInput[] = [
  { name: "מרטין בדיקה", allocation: "טכנאי", previous: "5.1", current: "6.35", weekends: "3", exemptions: "" },
  { name: "איתן דוגמה", allocation: 'אחמ"ש', previous: "-", current: "7.75", weekends: "0", exemptions: "שמירות" },
  { name: "נועה עובדת", allocation: "ר\"צ", previous: "4", current: "-", weekends: "-", exemptions: 'מטבח, רס"ר' },
];

function totalRow(previous: string, current: string, weekends: string): string[] {
  return [...pad(LEFT_PAD), "סך הכל:", "", previous, current, weekends, ""];
}

const H1_TARGET_LEGEND_ROW = [...pad(LEFT_PAD), 'ערך הקצאת טכנאי = 2X | ערך הקצאת אחמ"ש = X'];
const H1_TARGET_VALUE_ROW = [
  ...pad(LEFT_PAD),
  "X = 3 | 2X = 6 - שימו לב, ההקצאה נעה סביב המספרים האלו ויכולה לחרוג!",
];
const H2_TARGET_VALUE_ROW = [
  ...pad(LEFT_PAD),
  "X = 4 | 2X = 8 - שימו לב, ההקצאה נעה סביב המספרים האלו ויכולה לחרוג!",
];

function h1Sheet(): RawSheet {
  return buildFairnessSheet({
    name: 'פוטנציאל תקש"אס 1-6/2026',
    title: true,
    rows: STANDARD_ROWS,
    totalRow: totalRow("9.1", "14.1", "3"),
    targetNoteRows: [H1_TARGET_LEGEND_ROW, H1_TARGET_VALUE_ROW],
  });
}

function h2Sheet(): RawSheet {
  return buildFairnessSheet({
    name: 'פוטנציאל תקש"אס 7-12/2026',
    title: true,
    rows: STANDARD_ROWS,
    totalRow: totalRow("9.1", "14.1", "3"),
    targetNoteRows: [H1_TARGET_LEGEND_ROW, H2_TARGET_VALUE_ROW],
  });
}

describe("parseFairnessTable — title detection is not required, header IS the anchor", () => {
  it("locates the table via the exact six headers, ignoring the title row entirely", () => {
    const withTitle = parseFairnessTable(h1Sheet(), personnel);
    const withoutTitle = parseFairnessTable(
      buildFairnessSheet({ name: 'פוטנציאל תקש"אס 1-6/2026', rows: STANDARD_ROWS, title: false }),
      personnel,
    );
    expect(withTitle.personRows).toHaveLength(3);
    expect(withoutTitle.personRows).toHaveLength(3);
  });

  it("returns empty data when the exact six-header row is missing", () => {
    const sheet: RawSheet = { name: "x", values: [["שם", "הקצאה"], ["מרטין", "טכנאי"]] };
    const result = parseFairnessTable(sheet, personnel);
    expect(result.personRows).toEqual([]);
    expect(result.totals).toBeNull();
    expect(result.targets).toEqual({ supervisorTarget: null, technicianTarget: null });
  });

  it("never hard-codes W:AB -- the table still parses after moving further right/left", () => {
    const shifted = buildFairnessSheet({ name: "x", rows: STANDARD_ROWS });
    // Re-shift the fixed LEFT_PAD offset used by the fixture builder to prove structural (not column-index) location.
    const reshifted: RawSheet = {
      name: "x",
      values: shifted.values.map((row) => ["", "", "", ...row]), // shove everything 3 columns further right
    };
    const result = parseFairnessTable(reshifted, personnel);
    expect(result.personRows).toHaveLength(3);
  });
});

describe("parseFairnessTable — H1 data rows (verified real schema)", () => {
  const result = parseFairnessTable(h1Sheet(), personnel);

  it("parses exactly 3 person rows, never treating the total row as a person", () => {
    expect(result.personRows).toHaveLength(3);
    expect(result.personRows.some((row) => row.sourceName.startsWith("סך הכל"))).toBe(false);
  });

  it("parses decimal previous/current scores", () => {
    const martin = result.personRows.find((row) => row.sourceName === "מרטין בדיקה");
    expect(martin?.previousScore).toBe(5.1);
    expect(martin?.currentScore).toBe(6.35);
  });

  it('"-" previous score parses to null, never 0', () => {
    const eitan = result.personRows.find((row) => row.sourceName === "איתן דוגמה");
    expect(eitan?.previousScore).toBeNull();
    expect(eitan?.currentScore).toBe(7.75);
  });

  it('"-" weekend count parses to null; zero weekends remains 0 (never conflated)', () => {
    const eitan = result.personRows.find((row) => row.sourceName === "איתן דוגמה");
    const noa = result.personRows.find((row) => row.sourceName === "נועה עובדת");
    expect(eitan?.weekendCount).toBe(0);
    expect(noa?.weekendCount).toBeNull();
  });

  it("preserves the raw allocation label as source data", () => {
    const noa = result.personRows.find((row) => row.sourceName === "נועה עובדת");
    expect(noa?.allocationLabel).toBe('ר"צ');
  });

  it("parses the total row separately from person rows", () => {
    expect(result.totals).not.toBeNull();
    expect(result.totals?.reportedPreviousTotal).toBe(9.1);
    expect(result.totals?.reportedCurrentTotal).toBe(14.1);
    expect(result.totals?.reportedWeekendTotal).toBe(3);
  });

  it("never treats note/explanation rows below the total as people", () => {
    expect(result.personRows.every((row) => !row.sourceName.includes("ערך הקצאת"))).toBe(true);
    expect(result.personRows).toHaveLength(3);
  });

  it("parses the X/2X target note (H1: X=3, 2X=6)", () => {
    expect(result.targets).toEqual({ supervisorTarget: 3, technicianTarget: 6 });
  });

  it("exact unique person resolution", () => {
    const martin = result.personRows.find((row) => row.sourceName === "מרטין בדיקה");
    expect(martin?.resolvedPersonId).toBe(MARTIN.id);
  });

  it("comma-separated exemptions, trimmed", () => {
    const noa = result.personRows.find((row) => row.sourceName === "נועה עובדת");
    expect(noa?.exemptions).toEqual(["מטבח", 'רס"ר']);
  });

  it("single exemption label", () => {
    const eitan = result.personRows.find((row) => row.sourceName === "איתן דוגמה");
    expect(eitan?.exemptions).toEqual(["שמירות"]);
  });

  it("no exemptions -> empty array, not null/undefined", () => {
    const martin = result.personRows.find((row) => row.sourceName === "מרטין בדיקה");
    expect(martin?.exemptions).toEqual([]);
  });

  it("deterministic row order (top-to-bottom, matches sheet order)", () => {
    expect(result.personRows.map((row) => row.sourceName)).toEqual(["מרטין בדיקה", "איתן דוגמה", "נועה עובדת"]);
  });

  it("input sheet is never mutated", () => {
    const sheet = h1Sheet();
    const before = JSON.stringify(sheet);
    parseFairnessTable(sheet, personnel);
    expect(JSON.stringify(sheet)).toBe(before);
  });

  it("is pure -- calling it twice with the same input gives the same result", () => {
    expect(parseFairnessTable(h1Sheet(), personnel)).toEqual(parseFairnessTable(h1Sheet(), personnel));
  });
});

describe("parseFairnessTable — H2 shares the same schema with its OWN period-specific target values", () => {
  const result = parseFairnessTable(h2Sheet(), personnel);

  it("parses the same 3 rows", () => {
    expect(result.personRows).toHaveLength(3);
  });

  it("parses the X/2X target note (H2: X=4, 2X=8) -- never the H1 values", () => {
    expect(result.targets).toEqual({ supervisorTarget: 4, technicianTarget: 8 });
  });
});

describe("parseFairnessTable — target note edge cases", () => {
  it("malformed/missing target note -> null targets, never a default", () => {
    const sheet = buildFairnessSheet({ name: "x", rows: STANDARD_ROWS, totalRow: totalRow("9.1", "14.1", "3") });
    const result = parseFairnessTable(sheet, personnel);
    expect(result.targets).toEqual({ supervisorTarget: null, technicianTarget: null });
  });

  it("the legend line alone (no digits) never produces a guessed target", () => {
    const sheet = buildFairnessSheet({
      name: "x",
      rows: STANDARD_ROWS,
      totalRow: totalRow("9.1", "14.1", "3"),
      targetNoteRows: [H1_TARGET_LEGEND_ROW],
    });
    const result = parseFairnessTable(sheet, personnel);
    expect(result.targets).toEqual({ supervisorTarget: null, technicianTarget: null });
  });

  it("the note parses even when split across separate cells on the same row", () => {
    const sheet = buildFairnessSheet({
      name: "x",
      rows: STANDARD_ROWS,
      totalRow: totalRow("9.1", "14.1", "3"),
      targetNoteRows: [[...pad(LEFT_PAD), "X = 3", "2X = 6", "שימו לב"]],
    });
    const result = parseFairnessTable(sheet, personnel);
    expect(result.targets).toEqual({ supervisorTarget: 3, technicianTarget: 6 });
  });

  it("target search only starts AFTER the total row -- a person row's own text is never misread as the note", () => {
    const sheet = buildFairnessSheet({
      name: "x",
      rows: [{ name: "X = 3", allocation: "2X = 6", previous: "1", current: "2", weekends: "0", exemptions: "" }],
      totalRow: totalRow("1", "2", "0"),
      targetNoteRows: [H1_TARGET_VALUE_ROW],
    });
    const result = parseFairnessTable(sheet, personnel);
    expect(result.personRows).toHaveLength(1);
    expect(result.targets).toEqual({ supervisorTarget: 3, technicianTarget: 6 });
  });
});

describe("parseFairnessTable — person resolution safety", () => {
  it("unknown source name remains unresolved (null), row still present", () => {
    const sheet = buildFairnessSheet({
      name: "x",
      rows: [{ name: "מישהו שלא קיים", allocation: "טכנאי", previous: "1", current: "2", weekends: "0", exemptions: "" }],
    });
    const result = parseFairnessTable(sheet, personnel);
    expect(result.personRows).toHaveLength(1);
    expect(result.personRows[0].resolvedPersonId).toBeNull();
    expect(result.personRows[0].sourceName).toBe("מישהו שלא קיים");
  });

  it("duplicate personnel names never resolve arbitrarily -- stays unresolved", () => {
    const dup1 = syntheticPerson("כפול כפולי");
    const dup2 = { ...syntheticPerson("כפול כפולי"), id: "id_כפול_2" };
    const ambiguousPersonnel = [...personnel, dup1, dup2];

    const sheet = buildFairnessSheet({
      name: "x",
      rows: [{ name: "כפול כפולי", allocation: "טכנאי", previous: "1", current: "2", weekends: "0", exemptions: "" }],
    });
    const result = parseFairnessTable(sheet, ambiguousPersonnel);
    expect(result.personRows[0].resolvedPersonId).toBeNull();
  });

  it("whitespace normalization still resolves a unique match", () => {
    const sheet = buildFairnessSheet({
      name: "x",
      rows: [{ name: "  מרטין   בדיקה  ", allocation: "טכנאי", previous: "1", current: "2", weekends: "0", exemptions: "" }],
    });
    const result = parseFairnessTable(sheet, personnel);
    expect(result.personRows[0].resolvedPersonId).toBe(MARTIN.id);
  });

  it("an unresolved historical row is never dropped just because the person isn't in the current roster", () => {
    const sheet = buildFairnessSheet({
      name: "x",
      rows: [{ name: "עזב את הצוות", allocation: "טכנאי", previous: "1", current: "2", weekends: "0", exemptions: "" }],
    });
    const result = parseFairnessTable(sheet, personnel);
    expect(result.personRows).toHaveLength(1);
  });
});

describe("parseFairnessTable — structural edge cases", () => {
  it("returns empty data for a completely empty sheet", () => {
    expect(parseFairnessTable({ name: "empty", values: [] }, personnel)).toEqual({
      personRows: [],
      totals: null,
      targets: { supervisorTarget: null, technicianTarget: null },
    });
  });

  it("blank separator rows between the header and data never stop the scan", () => {
    const values = [
      [...pad(LEFT_PAD), ...FAIRNESS_HEADER],
      [],
      fairnessRow(STANDARD_ROWS[0]),
    ];
    const result = parseFairnessTable({ name: "x", values }, personnel);
    expect(result.personRows).toHaveLength(1);
  });
});
