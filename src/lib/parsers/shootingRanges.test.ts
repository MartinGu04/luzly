import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parseShootingRangeRelevanceSheet, parseShootingRangesSheet } from "./shootingRanges";

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

  describe("real-world Unicode/bidi name-matching robustness (visually-identical names must still resolve)", () => {
    const RTL_MARK = "\u200F";
    const LTR_MARK = "\u200E";
    const NBSP = "\u00A0";

    it("matches a sheet name carrying an embedded RTL mark that a personnel name doesn't have -- invisible, no visual difference", () => {
      const LEV = syntheticPerson("לב סינייצקי");
      const sourceNameWithRtlMark = `לב${RTL_MARK} סינייצקי`;
      const result = parseShootingRangesSheet(
        sheet([
          ["שם", "תאריך ביצוע מטווח"],
          [sourceNameWithRtlMark, "29/06/2026"],
        ]),
        [LEV],
      );
      expect(result[0].resolvedPersonId).toBe(LEV.id);
    });

    it("matches when the PERSONNEL name (not the sheet name) carries the invisible mark", () => {
      const LEV = syntheticPerson(`לב${LTR_MARK} סינייצקי`);
      const result = parseShootingRangesSheet(
        sheet([
          ["שם", "תאריך ביצוע מטווח"],
          ["לב סינייצקי", "29/06/2026"],
        ]),
        [LEV],
      );
      expect(result[0].resolvedPersonId).toBe(LEV.id);
    });

    it("matches names whose diacritics differ in Unicode composition form (precomposed vs base+combining-mark) -- a general robustness step, not Hebrew-specific (plain Hebrew names without niqqud have no such distinction to begin with)", () => {
      // "e" + combining acute accent (U+0065 U+0301) vs the single precomposed "é" -- canonically equivalent, visually identical, byte-different without NFC.
      const decomposed = "e\u0301";
      const precomposed = "\u00e9";
      expect(decomposed.normalize("NFC")).toBe(precomposed); // sanity check the two forms really are canonically equivalent
      const LEV = syntheticPerson(`בדיקה ${precomposed}`);
      const result = parseShootingRangesSheet(
        sheet([
          ["שם", "תאריך ביצוע מטווח"],
          [`בדיקה ${decomposed}`, "29/06/2026"],
        ]),
        [LEV],
      );
      expect(result[0].resolvedPersonId).toBe(LEV.id);
    });

    it("matches a sheet name using a non-breaking space where the personnel name uses a regular space", () => {
      const LEV = syntheticPerson("לב סינייצקי");
      const sourceNameWithNbsp = `לב${NBSP}סינייצקי`;
      const result = parseShootingRangesSheet(
        sheet([
          ["שם", "תאריך ביצוע מטווח"],
          [sourceNameWithNbsp, "29/06/2026"],
        ]),
        [LEV],
      );
      expect(result[0].resolvedPersonId).toBe(LEV.id);
    });

    it("still fails closed for a GENUINE spelling difference -- hardened normalization never becomes fuzzy matching", () => {
      const LEV = syntheticPerson("לב סינייצקי");
      const result = parseShootingRangesSheet(
        sheet([
          ["שם", "תאריך ביצוע מטווח"],
          ["לייב סינייצקי", "29/06/2026"],
        ]),
        [LEV],
      );
      expect(result[0].resolvedPersonId).toBeNull();
    });
  });

  it("recognizes the real production sheet's actual performed-on header -- 'תאריך ביצוע מטווחים' (plural), not just the previously-assumed singular alias -- and still ignores the manual expiry/status/relevance columns (regression: a header mismatch here silently returned [] for the WHOLE sheet, not just one row)", () => {
    const LEV = syntheticPerson("לב סיניצקי");
    const result = parseShootingRangesSheet(
      sheet([
        ["שם", "תאריך ביצוע מטווחים", "תאריך תפוגה", "סטטוס", "רלוונטיות"],
        ["לב סיניצקי", "29/06/2026", "29/12/2026", "תקף", "רלוונטי"],
      ]),
      [LEV],
    );

    expect(result).toEqual([
      {
        sourceName: "לב סיניצקי",
        resolvedPersonId: LEV.id,
        performedOn: "2026-06-29",
        sourceSheet: "מטווחים",
        sourceCell: "A2",
      },
    ]);
  });
});

describe("parseShootingRangeRelevanceSheet", () => {
  it("parses רלוונטי and לא רלוונטי rows using the exact real Sheet headers, independent of whether a completion date is present", () => {
    const result = parseShootingRangeRelevanceSheet(
      sheet([
        ["שם", "תאריך ביצוע מטווחים", "תאריך תפוגה", "סטטוס", "רלוונטיות", "סיבה / הערה"],
        ["מרטין בדיקה", "29/06/2026", "29/12/2026", "תקף", "רלוונטי", ""],
        ["איתן דוגמה", "", "", "", "לא רלוונטי", "פטור שמירות"],
      ]),
      personnel,
    );

    expect(result).toEqual([
      {
        sourceName: "מרטין בדיקה",
        resolvedPersonId: MARTIN.id,
        relevance: "relevant",
        reason: null,
        sourceSheet: "מטווחים",
        sourceCell: "A2",
      },
      {
        sourceName: "איתן דוגמה",
        resolvedPersonId: EITAN.id,
        relevance: "not_relevant",
        reason: "פטור שמירות",
        sourceSheet: "מטווחים",
        sourceCell: "A3",
      },
    ]);
  });

  it("still parses a לא רלוונטי row with a STALE completion date -- unlike parseShootingRangesSheet, blank/malformed performedOn never causes this row to be skipped", () => {
    const result = parseShootingRangeRelevanceSheet(
      sheet([
        ["שם", "תאריך ביצוע מטווחים", "רלוונטיות", "סיבה / הערה"],
        ["מרטין בדיקה", "23/02/2026", "לא רלוונטי", "פטור שמירות"],
        ["איתן דוגמה", "", "לא רלוונטי", ""],
      ]),
      personnel,
    );

    expect(result.map((r) => r.sourceName)).toEqual(["מרטין בדיקה", "איתן דוגמה"]);
    expect(result[0].relevance).toBe("not_relevant");
    expect(result[1].relevance).toBe("not_relevant");
    expect(result[1].reason).toBeNull();
  });

  it("reason is optional -- a blank סיבה / הערה cell normalizes to null, never an empty string", () => {
    const result = parseShootingRangeRelevanceSheet(
      sheet([
        ["שם", "רלוונטיות", "סיבה / הערה"],
        ["מרטין בדיקה", "לא רלוונטי", ""],
      ]),
      personnel,
    );
    expect(result[0].reason).toBeNull();
  });

  it("skips a row whose רלוונטיות cell is blank or unrecognized text -- never guessed", () => {
    const result = parseShootingRangeRelevanceSheet(
      sheet([
        ["שם", "רלוונטיות"],
        ["מרטין בדיקה", ""],
        ["איתן דוגמה", "אולי"],
      ]),
      personnel,
    );
    expect(result).toEqual([]);
  });

  it("does NOT infer relevance from the reason text -- only the explicit רלוונטיות value controls it", () => {
    const result = parseShootingRangeRelevanceSheet(
      sheet([
        ["שם", "רלוונטיות", "סיבה / הערה"],
        ["מרטין בדיקה", "", "לא רלוונטי - פטור שמירות"],
      ]),
      personnel,
    );
    expect(result).toEqual([]);
  });

  it("returns an empty array when the sheet has no רלוונטיות column at all (an older workbook snapshot)", () => {
    const result = parseShootingRangeRelevanceSheet(
      sheet([
        ["שם", "תאריך ביצוע מטווח"],
        ["מרטין בדיקה", "29/06/2026"],
      ]),
      personnel,
    );
    expect(result).toEqual([]);
  });

  it("fails closed to a null resolvedPersonId for an ambiguous name, same convention as parseShootingRangesSheet", () => {
    const result = parseShootingRangeRelevanceSheet(
      sheet([
        ["שם", "רלוונטיות"],
        ["כפול כפולי", "לא רלוונטי"],
      ]),
      personnel,
    );
    expect(result[0].resolvedPersonId).toBeNull();
  });
});
