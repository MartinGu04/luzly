import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parseShootingRangesSheet } from "./shootingRanges";

function syntheticPerson(name: string, overrides: Partial<Person> = {}): Person {
  return {
    id: `id_${name}`,
    name,
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

const MARTIN = syntheticPerson("מרטין בדיקה");
const EITAN = syntheticPerson("איתן דוגמה");
const DOUBLE_A = syntheticPerson("כפול כפולי");
const DOUBLE_B = syntheticPerson("כפול כפולי");
const personnel = [MARTIN, EITAN, DOUBLE_A, DOUBLE_B];

function sheet(values: (string | number | boolean | null)[][]): RawSheet {
  return { name: "מטווחים", values };
}

describe("parseShootingRangesSheet", () => {
  it("parses a well-formed sheet with the documented header shape", () => {
    const result = parseShootingRangesSheet(
      sheet([
        ["שם", "תאריך ביצוע מטווח", "תאריך תפוגת התוקף", "בתוקף / לא תקף"],
        ["מרטין בדיקה", "29/06/2026", "29/12/2026", "בתוקף"],
        ["איתן דוגמה", "01/01/2025", "01/07/2025", "לא תקף"],
      ]),
      personnel,
    );

    expect(result).toEqual([
      {
        sourceName: "מרטין בדיקה",
        resolvedPersonId: MARTIN.id,
        performedOn: "2026-06-29",
        sourceSheet: "מטווחים",
        sourceCell: "A2",
      },
      {
        sourceName: "איתן דוגמה",
        resolvedPersonId: EITAN.id,
        performedOn: "2025-01-01",
        sourceSheet: "מטווחים",
        sourceCell: "A3",
      },
    ]);
  });

  it("never reads the manually-entered expiry/status columns into anything (only name + performed-on)", () => {
    const result = parseShootingRangesSheet(
      sheet([
        ["שם", "תאריך ביצוע מטווח", "תאריך תפוגת התוקף", "בתוקף / לא תקף"],
        // Manual status/expiry are wrong/contradictory -- must have zero effect on the parsed record.
        ["מרטין בדיקה", "29/06/2026", "01/01/2000", "לא תקף"],
      ]),
      personnel,
    );

    expect(result).toEqual([
      {
        sourceName: "מרטין בדיקה",
        resolvedPersonId: MARTIN.id,
        performedOn: "2026-06-29",
        sourceSheet: "מטווחים",
        sourceCell: "A2",
      },
    ]);
  });

  it("tolerates reordered columns -- headers are located by text, never fixed letters", () => {
    const result = parseShootingRangesSheet(
      sheet([
        ["בתוקף / לא תקף", "תאריך ביצוע מטווח", "שם"],
        ["בתוקף", "29/06/2026", "מרטין בדיקה"],
      ]),
      personnel,
    );

    expect(result).toEqual([
      {
        sourceName: "מרטין בדיקה",
        resolvedPersonId: MARTIN.id,
        performedOn: "2026-06-29",
        sourceSheet: "מטווחים",
        sourceCell: "C2",
      },
    ]);
  });

  it("skips a row with a blank name", () => {
    const result = parseShootingRangesSheet(
      sheet([
        ["שם", "תאריך ביצוע מטווח"],
        ["", "29/06/2026"],
      ]),
      personnel,
    );
    expect(result).toEqual([]);
  });

  it("skips a row with a blank/malformed completion date -- never guessed (spec: blank date -> no qualification)", () => {
    const result = parseShootingRangesSheet(
      sheet([
        ["שם", "תאריך ביצוע מטווח"],
        ["מרטין בדיקה", ""],
        ["איתן דוגמה", "לא ידוע"],
      ]),
      personnel,
    );
    expect(result).toEqual([]);
  });

  it("fails closed to a null resolvedPersonId for an unknown name -- never assigned to someone else", () => {
    const result = parseShootingRangesSheet(
      sheet([
        ["שם", "תאריך ביצוע מטווח"],
        ["שם לא קיים", "29/06/2026"],
      ]),
      personnel,
    );
    expect(result).toEqual([
      {
        sourceName: "שם לא קיים",
        resolvedPersonId: null,
        performedOn: "2026-06-29",
        sourceSheet: "מטווחים",
        sourceCell: "A2",
      },
    ]);
  });

  it("fails closed to a null resolvedPersonId when the name is ambiguous (two personnel share it) -- never a last-write-wins pick", () => {
    const result = parseShootingRangesSheet(
      sheet([
        ["שם", "תאריך ביצוע מטווח"],
        ["כפול כפולי", "29/06/2026"],
      ]),
      personnel,
    );
    expect(result).toEqual([
      {
        sourceName: "כפול כפולי",
        resolvedPersonId: null,
        performedOn: "2026-06-29",
        sourceSheet: "מטווחים",
        sourceCell: "A2",
      },
    ]);
  });

  it("returns an empty array when no recognizable header row exists", () => {
    const result = parseShootingRangesSheet(sheet([["הערות כלליות"], ["טקסט חופשי"]]), personnel);
    expect(result).toEqual([]);
  });

  it("returns an empty array for a header row missing the performed-on column", () => {
    const result = parseShootingRangesSheet(
      sheet([
        ["שם", "הערות"],
        ["מרטין בדיקה", "משהו"],
      ]),
      personnel,
    );
    expect(result).toEqual([]);
  });
});
