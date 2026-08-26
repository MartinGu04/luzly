import { describe, expect, it } from "vitest";
import type { RawCellValue, RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { EMERGENCY_DESK_NAMES } from "@/lib/domain/emergencyDesks";
import { parseEmergencyScheduleSheet } from "./emergencySchedule";

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "דני בדיקה",
    email: "dani@example.invalid",
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

/** A:B legacy, C:L desks, M shift type, N day of week, O date. */
const HEADER_ROW: RawCellValue[] = [
  "ס קרקעי",
  "צ",
  "הוגוורט",
  "פ'",
  "ק'",
  "הנחשונים",
  "כחולה",
  'מפקד כטמ"מ', // I -- raw legacy header text, must NOT be used as the desk name
  "ס' אוורי ב'",
  "תיעוד",
  "משה דץ הצדיק",
  'מפקד מכלול', // L -- raw legacy header text, must NOT be used as the desk name
  "סוג משמרת",
  "יום בשבוע",
  "תאריכים",
];

function dataRow(
  overrides: {
    a?: RawCellValue;
    b?: RawCellValue;
    desks?: RawCellValue[]; // 10 values for columns C..L
    shiftType?: RawCellValue;
    dayOfWeek?: RawCellValue;
    date?: RawCellValue;
  } = {},
): RawCellValue[] {
  const desks = overrides.desks ?? Array(10).fill("");
  return [
    overrides.a ?? "",
    overrides.b ?? "",
    ...desks,
    overrides.shiftType ?? "",
    overrides.dayOfWeek ?? "",
    overrides.date ?? "",
  ];
}

function sheet(rows: RawCellValue[][]): RawSheet {
  return { name: "משמרות", values: [HEADER_ROW, ...rows] };
}

describe("parseEmergencyScheduleSheet — header row detection", () => {
  it("returns a diagnostic and no assignments when the header row cannot be found", () => {
    const result = parseEmergencyScheduleSheet({ name: "משמרות", values: [["irrelevant"]] }, []);

    expect(result.assignments).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("שורת כותרת");
  });
});

describe("parseEmergencyScheduleSheet — legacy A/B columns", () => {
  it("never treats columns A/B as desks, even when populated", () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const rows = [
      dataRow({
        a: "ערך זר בעמודה A",
        b: "ערך זר בעמודה B",
        desks: ["אליס בדיקה", "", "", "", "", "", "", "", "", ""],
        shiftType: "יום",
        date: "26/08/2026",
      }),
    ];

    const result = parseEmergencyScheduleSheet(sheet(rows), [alice]);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].desk).toBe("הוגוורט");
    expect(result.assignments.some((a) => (a.personName as string).includes("עמודה A"))).toBe(false);
    expect(result.assignments.some((a) => (a.personName as string).includes("עמודה B"))).toBe(false);
  });
});

describe("parseEmergencyScheduleSheet — canonical desk mapping (C:L)", () => {
  it("maps all ten columns to exactly the canonical desk names, including the two renamed ones", () => {
    const people = EMERGENCY_DESK_NAMES.map((name, index) => person({ id: `p_${index}`, name: `שם ${index}` }));
    const rows = [
      dataRow({
        desks: people.map((p) => p.name),
        shiftType: "יום",
        date: "26/08/2026",
      }),
    ];

    const result = parseEmergencyScheduleSheet(sheet(rows), people);

    expect(result.assignments).toHaveLength(10);
    expect(result.assignments.map((a) => a.desk)).toEqual([...EMERGENCY_DESK_NAMES]);
  });

  it("column I resolves to the CURRENT desk name 'ס' אווירי א'', never the raw legacy header 'מפקד כטמ\"מ'", () => {
    const bob = person({ id: "p_bob", name: "בוב בדיקה" });
    const desks = Array(10).fill("");
    desks[6] = "בוב בדיקה"; // column I is the 7th desk column (index 6 within the 10-slot desks array, columnIndex 8 overall)
    const rows = [dataRow({ desks, shiftType: "לילה", date: "26/08/2026" })];

    const result = parseEmergencyScheduleSheet(sheet(rows), [bob]);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].desk).toBe("ס' אווירי א'");
  });

  it("column L resolves to the CURRENT desk name 'מפקד דסק', never the raw legacy header 'מפקד מכלול'", () => {
    const carol = person({ id: "p_carol", name: "כרמל בדיקה" });
    const desks = Array(10).fill("");
    desks[9] = "כרמל בדיקה"; // column L is the 10th desk column
    const rows = [dataRow({ desks, shiftType: "יום", date: "26/08/2026" })];

    const result = parseEmergencyScheduleSheet(sheet(rows), [carol]);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].desk).toBe("מפקד דסק");
  });
});

describe("parseEmergencyScheduleSheet — day/night period parsing", () => {
  it("parses יום as 'day' and לילה as 'night'", () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const desks = Array(10).fill("");
    desks[0] = "אליס בדיקה";
    const rows = [
      dataRow({ desks, shiftType: "יום", date: "26/08/2026" }),
      dataRow({ desks, shiftType: "לילה" }), // night row, blank date -- inherits
    ];

    const result = parseEmergencyScheduleSheet(sheet(rows), [alice]);

    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0].period).toBe("day");
    expect(result.assignments[1].period).toBe("night");
  });
});

describe("parseEmergencyScheduleSheet — night row date forward-fill", () => {
  it("a blank date cell inherits the most recent valid date seen so far", () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const desks = Array(10).fill("");
    desks[0] = "אליס בדיקה";
    const rows = [
      dataRow({ desks, shiftType: "יום", date: "26/08/2026" }),
      dataRow({ desks, shiftType: "לילה", date: "" }),
    ];

    const result = parseEmergencyScheduleSheet(sheet(rows), [alice]);

    expect(result.assignments[0].date).toBe("2026-08-26");
    expect(result.assignments[1].date).toBe("2026-08-26");
  });

  it("forward-fill carries across multiple consecutive blank-date rows and updates on the next real date", () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const desks = Array(10).fill("");
    desks[0] = "אליס בדיקה";
    const rows = [
      dataRow({ desks, shiftType: "יום", date: "26/08/2026" }),
      dataRow({ desks, shiftType: "לילה", date: "" }),
      dataRow({ desks, shiftType: "יום", date: "27/08/2026" }),
      dataRow({ desks, shiftType: "לילה", date: "" }),
    ];

    const result = parseEmergencyScheduleSheet(sheet(rows), [alice]);

    expect(result.assignments.map((a) => a.date)).toEqual([
      "2026-08-26",
      "2026-08-26",
      "2026-08-27",
      "2026-08-27",
    ]);
  });
});

describe("parseEmergencyScheduleSheet — blank desk cells", () => {
  it("a blank desk cell produces no assignment for that desk", () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const desks = Array(10).fill("");
    desks[0] = "אליס בדיקה"; // only הוגוורט populated
    const rows = [dataRow({ desks, shiftType: "יום", date: "26/08/2026" })];

    const result = parseEmergencyScheduleSheet(sheet(rows), [alice]);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].desk).toBe("הוגוורט");
  });

  it("a row entirely blank (no period, no date, no desks) is skipped silently -- no diagnostic", () => {
    const rows = [dataRow(), dataRow(), dataRow()];

    const result = parseEmergencyScheduleSheet(sheet(rows), []);

    expect(result.assignments).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });
});

describe("parseEmergencyScheduleSheet — variable number of staffed people", () => {
  it("handles anywhere from zero to ten populated desks in the same row", () => {
    const people = [1, 2, 3, 4, 5].map((n) => person({ id: `p_${n}`, name: `אדם ${n}` }));
    const desks = Array(10).fill("");
    desks[0] = "אדם 1";
    desks[3] = "אדם 2";
    desks[4] = "אדם 3";
    desks[8] = "אדם 4";
    desks[9] = "אדם 5";
    const rows = [dataRow({ desks, shiftType: "יום", date: "26/08/2026" })];

    const result = parseEmergencyScheduleSheet(sheet(rows), people);

    expect(result.assignments).toHaveLength(5);
  });
});

describe("parseEmergencyScheduleSheet — malformed periods/dates fail safely", () => {
  it("an unrecognized shift-type text is skipped with a diagnostic, never guessed", () => {
    const desks = Array(10).fill("");
    desks[0] = "מישהו";
    const rows = [dataRow({ desks, shiftType: "בוקר", date: "26/08/2026" })];

    const result = parseEmergencyScheduleSheet(sheet(rows), []);

    expect(result.assignments).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("סוג משמרת לא מזוהה");
  });

  it("a missing shift-type on an otherwise-populated row is skipped with a diagnostic", () => {
    const desks = Array(10).fill("");
    desks[0] = "מישהו";
    const rows = [dataRow({ desks, shiftType: "", date: "26/08/2026" })];

    const result = parseEmergencyScheduleSheet(sheet(rows), []);

    expect(result.assignments).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("חסר סוג משמרת");
  });

  it("an unparseable date is skipped with a diagnostic, never fabricated", () => {
    const desks = Array(10).fill("");
    desks[0] = "מישהו";
    const rows = [dataRow({ desks, shiftType: "יום", date: "לא-תאריך" })];

    const result = parseEmergencyScheduleSheet(sheet(rows), []);

    expect(result.assignments).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("תאריך לא תקין");
  });

  it("a blank date with no prior valid date to forward-fill from is skipped with a diagnostic", () => {
    const desks = Array(10).fill("");
    desks[0] = "מישהו";
    const rows = [dataRow({ desks, shiftType: "לילה", date: "" })];

    const result = parseEmergencyScheduleSheet(sheet(rows), []);

    expect(result.assignments).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("אין תאריך");
  });

  it("a malformed date row does not corrupt forward-fill for later rows -- the last GOOD date still carries", () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const desks = Array(10).fill("");
    desks[0] = "אליס בדיקה";
    const rows = [
      dataRow({ desks, shiftType: "יום", date: "26/08/2026" }),
      dataRow({ desks, shiftType: "יום", date: "תאריך-שגוי" }), // malformed, skipped
      dataRow({ desks, shiftType: "לילה", date: "" }), // should inherit 26/08, not the malformed row
    ];

    const result = parseEmergencyScheduleSheet(sheet(rows), [alice]);

    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0].date).toBe("2026-08-26");
    expect(result.assignments[1].date).toBe("2026-08-26");
    expect(result.diagnostics).toHaveLength(1);
  });

  it("supports both D/M/Y and ISO date representations without hardcoding either", () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const desks = Array(10).fill("");
    desks[0] = "אליס בדיקה";
    const rows = [dataRow({ desks, shiftType: "יום", date: "2026-08-26" })];

    const result = parseEmergencyScheduleSheet(sheet(rows), [alice]);

    expect(result.assignments[0].date).toBe("2026-08-26");
  });
});

describe("parseEmergencyScheduleSheet — person resolution (no fuzzy matching)", () => {
  it("an unresolved name still produces a visible assignment -- personId null, raw name preserved", () => {
    const rows = [
      dataRow({
        desks: ["מישהו לא ידוע", "", "", "", "", "", "", "", "", ""],
        shiftType: "יום",
        date: "26/08/2026",
      }),
    ];

    const result = parseEmergencyScheduleSheet(sheet(rows), []);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].personId).toBeNull();
    expect(result.assignments[0].personName).toBe("מישהו לא ידוע");
  });

  it("never silently assigns an unresolved name to a similarly-named different person (no fuzzy matching)", () => {
    const similar = person({ id: "p_similar", name: "יוסי כהן" });
    const rows = [
      dataRow({
        desks: ["יוסי כהנא", "", "", "", "", "", "", "", "", ""], // close but not exact
        shiftType: "יום",
        date: "26/08/2026",
      }),
    ];

    const result = parseEmergencyScheduleSheet(sheet(rows), [similar]);

    expect(result.assignments[0].personId).toBeNull();
    expect(result.assignments[0].personName).toBe("יוסי כהנא");
  });

  it("resolves uniquely when exactly one personnel record matches the normalized name", () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const rows = [
      dataRow({ desks: ["אליס בדיקה", "", "", "", "", "", "", "", "", ""], shiftType: "יום", date: "26/08/2026" }),
    ];

    const result = parseEmergencyScheduleSheet(sheet(rows), [alice]);

    expect(result.assignments[0].personId).toBe("p_alice");
  });

  it("two personnel records sharing the same normalized name both fail to resolve -- never an arbitrary pick", () => {
    const a = person({ id: "p_a", name: "אליס בדיקה" });
    const b = person({ id: "p_b", name: "אליס בדיקה" });
    const rows = [
      dataRow({ desks: ["אליס בדיקה", "", "", "", "", "", "", "", "", ""], shiftType: "יום", date: "26/08/2026" }),
    ];

    const result = parseEmergencyScheduleSheet(sheet(rows), [a, b]);

    expect(result.assignments[0].personId).toBeNull();
  });
});

describe("parseEmergencyScheduleSheet — source cell tracking", () => {
  it("records the exact A1 source cell for each assignment", () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const desks = Array(10).fill("");
    desks[0] = "אליס בדיקה"; // column C
    const rows = [dataRow({ desks, shiftType: "יום", date: "26/08/2026" })];

    const result = parseEmergencyScheduleSheet(sheet(rows), [alice]);

    // header is row 1 (1-indexed), data row is row 2, column C.
    expect(result.assignments[0].sourceCell).toBe("C2");
  });
});
