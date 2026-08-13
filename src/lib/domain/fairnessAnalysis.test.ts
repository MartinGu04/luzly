import { describe, expect, it } from "vitest";
import type { FairnessPersonRow, FairnessTotalsRow } from "./fairnessTable";
import {
  computeGapToTarget,
  computeNormalizedLoad,
  computeScoreDelta,
  resolveComparisonTarget,
  resolveFairnessAllocationRole,
  validateFairnessTotals,
} from "./fairnessAnalysis";

describe("resolveFairnessAllocationRole — exact deterministic mapping only", () => {
  it('"טכנאי" -> technician', () => {
    expect(resolveFairnessAllocationRole("טכנאי")).toBe("technician");
  });

  it('אחמ"ש -> supervisor', () => {
    expect(resolveFairnessAllocationRole('אחמ"ש')).toBe("supervisor");
  });

  it.each(['ר"צ', "הסמכה", "הסמכת טכנאי אתרים", "משתחרר", "אחמ\"ש מ\"א"])(
    "%s never gets an invented role",
    (label) => {
      expect(resolveFairnessAllocationRole(label)).toBeNull();
    },
  );
});

describe("resolveComparisonTarget", () => {
  const targets = { supervisorTarget: 4, technicianTarget: 8 };

  it("technician label resolves to the technician target", () => {
    expect(resolveComparisonTarget("טכנאי", targets)).toBe(8);
  });

  it("supervisor label resolves to the supervisor target", () => {
    expect(resolveComparisonTarget('אחמ"ש', targets)).toBe(4);
  });

  it("unknown label -> null, even when targets are known", () => {
    expect(resolveComparisonTarget('ר"צ', targets)).toBeNull();
  });

  it("known role but the period's target itself is unknown -> null", () => {
    expect(resolveComparisonTarget("טכנאי", { supervisorTarget: null, technicianTarget: null })).toBeNull();
  });
});

describe("computeScoreDelta", () => {
  it("current - previous when both are known", () => {
    expect(computeScoreDelta(5.1, 6.5)).toBeCloseTo(1.4);
  });

  it("null previous -> null delta, never treated as 0", () => {
    expect(computeScoreDelta(null, 7.75)).toBeNull();
  });

  it("null current -> null delta", () => {
    expect(computeScoreDelta(5, null)).toBeNull();
  });

  it("equal scores -> 0", () => {
    expect(computeScoreDelta(5, 5)).toBe(0);
  });
});

describe("computeGapToTarget", () => {
  it("current - target", () => {
    expect(computeGapToTarget(6.3, 8)).toBeCloseTo(-1.7);
  });

  it("null current -> null", () => {
    expect(computeGapToTarget(null, 8)).toBeNull();
  });

  it("null target -> null", () => {
    expect(computeGapToTarget(6, null)).toBeNull();
  });
});

describe("computeNormalizedLoad — PR #15 §21/§42", () => {
  it("technician: current 6, target 8 -> 0.75", () => {
    expect(computeNormalizedLoad(6, 8)).toBeCloseTo(0.75);
  });

  it("supervisor: current 3, target 4 -> 0.75 (same relative load despite different raw scale)", () => {
    expect(computeNormalizedLoad(3, 4)).toBeCloseTo(0.75);
  });

  it("no target -> null", () => {
    expect(computeNormalizedLoad(6, null)).toBeNull();
  });

  it("no current score -> null", () => {
    expect(computeNormalizedLoad(null, 8)).toBeNull();
  });

  it("zero target -> null, never a division by zero", () => {
    expect(computeNormalizedLoad(6, 0)).toBeNull();
  });

  it("negative/invalid target -> null", () => {
    expect(computeNormalizedLoad(6, -1)).toBeNull();
  });
});

function personRow(overrides: Partial<FairnessPersonRow> = {}): FairnessPersonRow {
  return {
    sourceName: "מרטין בדיקה",
    resolvedPersonId: "p1",
    allocationLabel: "טכנאי",
    previousScore: 5,
    currentScore: 6,
    weekendCount: 2,
    exemptions: [],
    sourceSheet: "sheet",
    sourceCell: "A1",
    ...overrides,
  };
}

function totalsRow(overrides: Partial<FairnessTotalsRow> = {}): FairnessTotalsRow {
  return {
    reportedPreviousTotal: 10,
    reportedCurrentTotal: 12,
    reportedWeekendTotal: 4,
    sourceSheet: "sheet",
    sourceCell: "A9",
    ...overrides,
  };
}

describe("validateFairnessTotals — PR #15 §23/§43", () => {
  it("computed totals equal source totals -> no discrepancy", () => {
    const rows = [personRow({ previousScore: 5, currentScore: 6, weekendCount: 2 }), personRow({ previousScore: 5, currentScore: 6, weekendCount: 2 })];
    const totals = totalsRow({ reportedPreviousTotal: 10, reportedCurrentTotal: 12, reportedWeekendTotal: 4 });
    const result = validateFairnessTotals(rows, totals);
    expect(result.hasDiscrepancy).toBe(false);
    expect(result.computedPreviousTotal).toBe(10);
    expect(result.computedCurrentTotal).toBe(12);
    expect(result.computedWeekendTotal).toBe(4);
  });

  it("a real mismatch is flagged", () => {
    const rows = [personRow({ previousScore: 5, currentScore: 6, weekendCount: 2 })];
    const totals = totalsRow({ reportedCurrentTotal: 99 });
    const result = validateFairnessTotals(rows, totals);
    expect(result.currentMismatch).toBe(true);
    expect(result.hasDiscrepancy).toBe(true);
  });

  it("a tiny decimal difference within tolerance is not flagged", () => {
    const rows = [personRow({ previousScore: 5.001, currentScore: 6, weekendCount: 2 })];
    const totals = totalsRow({ reportedPreviousTotal: 5, reportedCurrentTotal: 6, reportedWeekendTotal: 2 });
    const result = validateFairnessTotals(rows, totals);
    expect(result.hasDiscrepancy).toBe(false);
  });

  it("null/'-' rows are excluded from the computed sum, never treated as 0 contributing a false mismatch", () => {
    const rows = [personRow({ previousScore: null, currentScore: 6, weekendCount: null }), personRow({ previousScore: 5, currentScore: 6, weekendCount: 2 })];
    const totals = totalsRow({ reportedPreviousTotal: 5, reportedCurrentTotal: 12, reportedWeekendTotal: 2 });
    const result = validateFairnessTotals(rows, totals);
    expect(result.hasDiscrepancy).toBe(false);
  });

  it("null totals row -> no discrepancy computed (nothing to compare against), computed sums still returned", () => {
    const rows = [personRow({ previousScore: 5, currentScore: 6, weekendCount: 2 })];
    const result = validateFairnessTotals(rows, null);
    expect(result.hasDiscrepancy).toBe(false);
    expect(result.computedCurrentTotal).toBe(6);
  });

  it("never mutates the input rows/totals", () => {
    const rows = [personRow()];
    const totals = totalsRow();
    const rowsBefore = JSON.stringify(rows);
    const totalsBefore = JSON.stringify(totals);
    validateFairnessTotals(rows, totals);
    expect(JSON.stringify(rows)).toBe(rowsBefore);
    expect(JSON.stringify(totals)).toBe(totalsBefore);
  });
});
