import { describe, expect, it } from "vitest";
import type { ManagerFairnessPersonRowView } from "@/lib/readModels/managerFairnessTypes";
import { managerFairnessSummaryLabel } from "./managerFairnessSummary";

function rowWithExemptions(count: number): ManagerFairnessPersonRowView {
  return {
    key: `row-${count}-${Math.random()}`,
    sourceName: "מרטין בדיקה",
    personId: null,
    allocationLabel: "טכנאי",
    previousScore: null,
    currentScore: null,
    delta: null,
    comparisonTarget: null,
    gapToTarget: null,
    normalizedLoad: null,
    weekendCount: null,
    exemptions: Array.from({ length: count }, () => ({ raw: "שמירות", affectedDutyFamilies: ["guard" as const] })),
  };
}

describe("managerFairnessSummaryLabel", () => {
  it("no rows, no totals -> null (nothing to say)", () => {
    expect(managerFairnessSummaryLabel({ rows: [], totals: null })).toBeNull();
  });

  it("combines the SOURCE-REPORTED total score, weekends, and exempt count", () => {
    const label = managerFairnessSummaryLabel({
      rows: [rowWithExemptions(1), rowWithExemptions(0)],
      totals: {
        reportedPreviousTotal: 10,
        reportedCurrentTotal: 12.5,
        reportedWeekendTotal: 6,
        displayedPreviousSum: 999, // deliberately different from reported -- must never leak into the summary
        displayedCurrentSum: 999,
        displayedWeekendSum: 999,
      },
    });
    expect(label).toBe('סה"כ ניקוד נוכחי 12.5 · סה"כ סופי שבוע 6 · איש/ת צוות אחת עם פטור');
  });

  it("plural exempt count phrasing", () => {
    const label = managerFairnessSummaryLabel({
      rows: [rowWithExemptions(1), rowWithExemptions(1)],
      totals: null,
    });
    expect(label).toBe("2 אנשי צוות עם פטורים");
  });

  it("a missing reported total is never silently replaced by the displayed-row sum -- that segment is simply omitted", () => {
    const label = managerFairnessSummaryLabel({
      rows: [],
      totals: {
        reportedPreviousTotal: null,
        reportedCurrentTotal: null,
        reportedWeekendTotal: null,
        displayedPreviousSum: 42,
        displayedCurrentSum: 42,
        displayedWeekendSum: 42,
      },
    });
    expect(label).toBeNull();
  });
});
