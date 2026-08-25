import { describe, expect, it } from "vitest";
import type { ReportOneDraft } from "@/lib/domain/reportOne";
import { formatReportOneDateDot, formatReportOneDateSlash, formatReportOneText, formatReportOneTitle } from "./reportOneFormat";

function draft(): ReportOneDraft {
  return {
    targetDate: "2026-08-26",
    sections: [
      {
        section: "permanent",
        label: "אנשי קבע💛:",
        people: [
          { personId: "p_1", name: "עמנואל צגה", section: "permanent", generatedStatus: "?" },
          { personId: "p_2", name: "הודיה טריקי", section: "permanent", generatedStatus: "?" },
        ],
      },
      {
        section: "reserve",
        label: "מילואים😍:",
        people: [{ personId: "p_3", name: "רועי לוין", section: "reserve", generatedStatus: 'נוכח, אחמ"ש לילה' }],
      },
      {
        section: "regular_manager",
        label: 'סדיר - אחמשים🧑🏻‍💻:',
        people: [{ personId: "p_4", name: "עילאי שפירא", section: "regular_manager", generatedStatus: 'נוכח, אחמ"ש יום' }],
      },
      {
        section: "regular_technician",
        label: 'סדיר - טכנאים🧑🏻‍🔧:',
        people: [{ personId: "p_5", name: "גדעון פולין", section: "regular_technician", generatedStatus: "חופש" }],
      },
    ],
  };
}

describe("formatReportOneDateSlash / formatReportOneDateDot", () => {
  it("zero-pads day/month for both formats", () => {
    expect(formatReportOneDateSlash("2026-08-06")).toBe("06/08/2026");
    expect(formatReportOneDateDot("2026-08-06")).toBe("06.08");
  });
});

describe("formatReportOneTitle", () => {
  it("matches the exact required title format", () => {
    expect(formatReportOneTitle("2026-08-26")).toBe("דוח 1: 26/08/2026🛰️");
  });
});

describe("formatReportOneText", () => {
  it("22. preserves section order, emojis, Hebrew, and line breaks", () => {
    const text = formatReportOneText(draft(), {});
    const lines = text.split("\n");

    expect(lines[0]).toBe("דוח 1: 26/08/2026🛰️");
    expect(lines).toContain("אנשי קבע💛:");
    expect(lines).toContain("מילואים😍:");
    expect(lines).toContain('סדיר - אחמשים🧑🏻‍💻:');
    expect(lines).toContain('סדיר - טכנאים🧑🏻‍🔧:');
    expect(lines).toContain("עמנואל צגה - ?");
    expect(lines).toContain('רועי לוין - נוכח, אחמ"ש לילה');

    // Section ordering preserved.
    const kevaIndex = lines.indexOf("אנשי קבע💛:");
    const miluimIndex = lines.indexOf("מילואים😍:");
    const managerIndex = lines.indexOf('סדיר - אחמשים🧑🏻‍💻:');
    const technicianIndex = lines.indexOf('סדיר - טכנאים🧑🏻‍🔧:');
    expect(kevaIndex).toBeLessThan(miluimIndex);
    expect(miluimIndex).toBeLessThan(managerIndex);
    expect(managerIndex).toBeLessThan(technicianIndex);

    // A blank line separates each section, but never precedes the first.
    expect(lines[1]).toBe("אנשי קבע💛:");
    expect(lines[miluimIndex - 1]).toBe("");
  });

  it("23/24. status overrides (manual edits) replace the generated status; an untouched person keeps its generated status", () => {
    const text = formatReportOneText(draft(), { p_1: "נוכחת, מגיעה בערב" });
    const lines = text.split("\n");
    expect(lines).toContain("עמנואל צגה - נוכחת, מגיעה בערב");
    expect(lines).toContain("הודיה טריקי - ?");
  });
});

// --- Reserve-inclusion toggle: copy behavior -------------------------------

describe("formatReportOneText — reserve inclusion", () => {
  it("2. omitting includeInReportOneByPersonId includes every reserve person (default true, backwards-compatible)", () => {
    const lines = formatReportOneText(draft(), {}).split("\n");
    expect(lines).toContain('רועי לוין - נוכח, אחמ"ש לילה');
  });

  it("2. a reserve person explicitly marked included (true) still appears", () => {
    const lines = formatReportOneText(draft(), {}, { p_3: true }).split("\n");
    expect(lines).toContain('רועי לוין - נוכח, אחמ"ש לילה');
  });

  it("3. a reserve person explicitly marked excluded (false) is completely omitted -- no line, no placeholder", () => {
    const lines = formatReportOneText(draft(), {}, { p_3: false }).split("\n");
    expect(lines).not.toContain('רועי לוין - נוכח, אחמ"ש לילה');
    expect(lines.some((line) => line.includes("רועי לוין"))).toBe(false);
  });

  it("no blank/empty placeholder line is left behind for an excluded reserve person -- only that person's own line disappears", () => {
    const withReserve = formatReportOneText(draft(), {}).split("\n");
    const withoutReserve = formatReportOneText(draft(), {}, { p_3: false }).split("\n");
    expect(withoutReserve.length).toBe(withReserve.length - 1);
    // Every OTHER line (section headers, blank section separators, other people) is unchanged.
    expect(withoutReserve).toEqual(withReserve.filter((line) => line !== 'רועי לוין - נוכח, אחמ"ש לילה'));
  });

  it("the מילואים section header itself still prints even when its only person is excluded", () => {
    const lines = formatReportOneText(draft(), {}, { p_3: false }).split("\n");
    expect(lines).toContain("מילואים😍:");
  });

  it("4. exclusion only applies to the reserve section -- a matching personId in another section is unaffected", () => {
    // p_4 belongs to regular_manager in the fixture; marking it "false" must never hide it.
    const lines = formatReportOneText(draft(), {}, { p_4: false }).split("\n");
    expect(lines).toContain('עילאי שפירא - נוכח, אחמ"ש יום');
  });
});
