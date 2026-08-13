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

// The verified real row-1 operational header layout, columns A:T, shared by both H1 and H2.
const REAL_HEADER_ROW = [
  "תאריך",
  "יום",
  "שומר 1",
  "שומר 2",
  "שומר 3",
  "שומר 4",
  "עתודה 1",
  "עתודה 2",
  "אוקסיד 1",
  "אוקסיד 2",
  "אוקסיד 3",
  "כונן פינויים",
  "מטבח יומי 1",
  "מטבח יומי 2",
  "מטבח מלא 1",
  "מטבח מלא 2",
  "מטבח מלא 3",
  'רס"ר 1',
  'רס"ר 2',
  "הערות",
];

/** One fully-populated data row exercising every mapped column, plus the placeholder and a blank. Purely synthetic (fictional) allocation values -- never real operational data. */
function fullDataRow(date: string) {
  return [
    date,
    "א",
    "סייבר", // שומר 1
    "מרטין בדיקה", // שומר 2 -- named source
    "///////////////////", // שומר 3 -- structural placeholder
    "", // שומר 4 -- blank
    "מבצעים", // עתודה 1
    "רוקם", // עתודה 2
    "סייבר", // אוקסיד 1
    "מבצעים", // אוקסיד 2
    "רוקם", // אוקסיד 3
    "איתן מרכז", // כונן פינויים
    "יחידה א", // מטבח יומי 1
    "יחידה ב", // מטבח יומי 2
    "יחידה ג", // מטבח מלא 1
    "יחידה ד", // מטבח מלא 2
    "יחידה ה", // מטבח מלא 3
    "יחידה ו", // רס"ר 1
    "יחידה ז", // רס"ר 2
    "הערה חופשית שלא אמורה להפוך לדרישה", // הערות
  ];
}

function h1Sheet(): RawSheet {
  return {
    name: 'פוטנציאל תקש"אס 1-6/2026',
    values: [REAL_HEADER_ROW, fullDataRow("23/08/2026")],
  };
}

// Fairness/scoring side-table, verified to live on LATER rows, further right (not row 1) -- a separate title row, then a separate header row, then score data rows. Purely synthetic values.
function h1SheetWithFairnessTable(): RawSheet {
  const blankPad = (n: number) => Array.from({ length: n }, () => "");
  return {
    name: 'פוטנציאל תקש"אס 1-6/2026',
    values: [
      REAL_HEADER_ROW,
      fullDataRow("23/08/2026"),
      fullDataRow("24/08/2026"),
      [], // blank separator row
      ["", ...blankPad(21), 'טבלת צדק - מחצית 1'], // fairness title, far right
      [
        "",
        ...blankPad(21),
        "שם",
        "הקצאה",
        "ניקוד הפוטנציאל הקודם",
        "ניקוד לפוטנציאל הנוכחי",
        'סופ"שים',
        "פטורים",
      ],
      ["", ...blankPad(21), "מרטין בדיקה", "5", "12", "14", "3", "1"],
      ["", ...blankPad(21), "איתן דוגמה", "4", "10", "11", "2", "0"],
    ],
  };
}

describe("parsePotentialSheet — verified real schema (H1)", () => {
  const allocations = parsePotentialSheet(h1Sheet(), personnel);

  it("maps שומר 1..4 to guard with the exact slot, skipping placeholder/blank", () => {
    const guard = allocations.filter((a) => a.dutyFamily === "guard");
    expect(guard.map((a) => a.slot).sort()).toEqual([1, 2]); // 3=placeholder, 4=blank, both skipped
    expect(guard.find((a) => a.slot === 1)?.sourceAllocationLabel).toBe("סייבר");
    expect(guard.find((a) => a.slot === 2)?.resolvedSourcePersonId).toBe(MARTIN.id);
  });

  it("maps עתודה 1..2 to reserve with the exact slot", () => {
    const reserve = allocations.filter((a) => a.dutyFamily === "reserve");
    expect(reserve.map((a) => a.slot).sort()).toEqual([1, 2]);
    expect(reserve.every((a) => a.resolvedSourcePersonId === null)).toBe(true);
  });

  it("maps אוקסיד 1..3 to oxid with source slot, null exact slot", () => {
    const oxid = allocations.filter((a) => a.dutyFamily === "oxid");
    expect(oxid.map((a) => a.sourceSlot).sort()).toEqual([1, 2, 3]);
    expect(oxid.every((a) => a.slot === null)).toBe(true);
  });

  it("maps כונן פינויים to evacuation_on_call with null slot and null sourceSlot", () => {
    const evac = allocations.find((a) => a.dutyFamily === "evacuation_on_call");
    expect(evac?.slot).toBeNull();
    expect(evac?.sourceSlot).toBeNull();
    expect(evac?.sourceAllocationLabel).toBe("איתן מרכז");
  });

  it("maps מטבח יומי 1..2 to daily_kitchen with source slot", () => {
    const dailyKitchen = allocations.filter((a) => a.dutyFamily === "daily_kitchen");
    expect(dailyKitchen.map((a) => a.sourceSlot).sort()).toEqual([1, 2]);
  });

  it("maps מטבח מלא 1..3 to full_kitchen with source slot", () => {
    const fullKitchen = allocations.filter((a) => a.dutyFamily === "full_kitchen");
    expect(fullKitchen.map((a) => a.sourceSlot).sort()).toEqual([1, 2, 3]);
  });

  it('maps רס"ר 1..2 to rasar with source slot', () => {
    const rasar = allocations.filter((a) => a.dutyFamily === "rasar");
    expect(rasar.map((a) => a.sourceSlot).sort()).toEqual([1, 2]);
  });

  it("excludes הערות entirely -- never a requirement", () => {
    expect(allocations.some((a) => a.columnLabel === "הערות")).toBe(false);
    expect(allocations.some((a) => a.sourceAllocationLabel.includes("הערה חופשית"))).toBe(false);
  });

  it("excludes the structural /////////////////// placeholder", () => {
    expect(allocations.some((a) => a.sourceAllocationLabel === "///////////////////")).toBe(false);
  });

  it("excludes blank cells", () => {
    const guardSlot4 = allocations.find((a) => a.dutyFamily === "guard" && a.slot === 4);
    expect(guardSlot4).toBeUndefined();
  });

  it("carries sourceSheet/sourceCell for internal traceability", () => {
    const guard1 = allocations.find((a) => a.dutyFamily === "guard" && a.slot === 1);
    expect(guard1?.sourceSheet).toBe('פוטנציאל תקש"אס 1-6/2026');
    expect(guard1?.sourceCell).toBe("C2");
  });

  it("produces exactly 15 allocations from a fully-populated row (17 mapped columns minus 1 placeholder minus 1 blank)", () => {
    expect(allocations).toHaveLength(15);
  });
});

describe("parsePotentialSheet — H2 shares the same verified schema", () => {
  const h2Sheet: RawSheet = {
    name: 'פוטנציאל תקש"אס 7-12/2026',
    values: [REAL_HEADER_ROW, fullDataRow("01/09/2026")],
  };
  const allocations = parsePotentialSheet(h2Sheet, personnel);

  it("parses identically to H1's schema", () => {
    expect(allocations).toHaveLength(15);
    expect(allocations.some((a) => a.dutyFamily === "guard" && a.slot === 1)).toBe(true);
    expect(allocations.some((a) => a.dutyFamily === "rasar")).toBe(true);
  });
});

describe("parsePotentialSheet — fairness side-table exclusion (verified real position)", () => {
  const allocations = parsePotentialSheet(h1SheetWithFairnessTable(), personnel);

  it("never produces an allocation from the fairness title row", () => {
    expect(allocations.some((a) => a.sourceAllocationLabel.includes("טבלת צדק"))).toBe(false);
  });

  it("never produces an allocation from the fairness header row (שם/הקצאה/ניקוד/סופ״שים/פטורים)", () => {
    const fairnessLabels = ["שם", "הקצאה", "ניקוד הפוטנציאל הקודם", "ניקוד לפוטנציאל הנוכחי", 'סופ"שים', "פטורים"];
    for (const allocation of allocations) {
      expect(fairnessLabels).not.toContain(allocation.columnLabel);
    }
  });

  it("never leaks a raw fairness score value anywhere in the output", () => {
    const rawValues = allocations.map((a) => a.sourceAllocationLabel);
    expect(rawValues).not.toContain("12");
    expect(rawValues).not.toContain("14");
    expect(rawValues).not.toContain("10");
  });

  it("still parses the real operational dates correctly despite the fairness rows below", () => {
    expect(allocations.some((a) => a.date === "2026-08-23")).toBe(true);
    expect(allocations.some((a) => a.date === "2026-08-24")).toBe(true);
  });

  it("only 2 operational data rows produce allocations (fairness rows never parse as dates)", () => {
    const dates = new Set(allocations.map((a) => a.date));
    expect(dates.size).toBe(2);
  });
});

describe("parsePotentialSheet — deterministic ordering", () => {
  it("preserves top-to-bottom, left-to-right ordering", () => {
    const allocations = parsePotentialSheet(h1Sheet(), personnel);
    const guardIndex = allocations.findIndex((a) => a.dutyFamily === "guard" && a.slot === 1);
    const reserveIndex = allocations.findIndex((a) => a.dutyFamily === "reserve" && a.sourceSlot === 1);
    expect(guardIndex).toBeLessThan(reserveIndex);
  });

  it("is pure -- calling it twice with the same input gives the same result", () => {
    expect(parsePotentialSheet(h1Sheet(), personnel)).toEqual(parsePotentialSheet(h1Sheet(), personnel));
  });
});

describe("parsePotentialSheet — structural edge cases", () => {
  it("returns an empty array for a sheet with no recognizable date/day header", () => {
    const sheet: RawSheet = { name: "empty", values: [["הערות", "משהו"], ["x", "y"]] };
    expect(parsePotentialSheet(sheet, personnel)).toEqual([]);
  });

  it("returns an empty array for a completely empty sheet", () => {
    expect(parsePotentialSheet({ name: "totally-empty", values: [] }, personnel)).toEqual([]);
  });

  it("skips a malformed/unparseable date row without crashing", () => {
    const sheet: RawSheet = { name: "x", values: [REAL_HEADER_ROW, fullDataRow("not-a-date")] };
    expect(parsePotentialSheet(sheet, personnel)).toEqual([]);
  });

  it("never mutates the input sheet", () => {
    const sheet = h1Sheet();
    const before = JSON.stringify(sheet);
    parsePotentialSheet(sheet, personnel);
    expect(JSON.stringify(sheet)).toBe(before);
  });
});
