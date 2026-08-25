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
