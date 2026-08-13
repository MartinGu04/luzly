import { describe, expect, it } from "vitest";
import type { FairnessPersonRow, FairnessTableParseResult } from "@/lib/domain/fairnessTable";
import type { Person } from "@/lib/domain/types";
import { buildManagerFairnessReadModel } from "./buildManagerFairnessReadModel";

const MANAGER: Person = {
  id: "p_manager",
  name: "דני מנהל",
  email: "dani@example.invalid",
  isManager: true,
  isTechnician: false,
  isSupervisor: false,
  personnelType: null,
};

function row(overrides: Partial<FairnessPersonRow> = {}): FairnessPersonRow {
  return {
    sourceName: "מרטין בדיקה",
    resolvedPersonId: "p_martin",
    allocationLabel: "טכנאי",
    previousScore: 5,
    currentScore: 6,
    weekendCount: 2,
    exemptions: [],
    sourceSheet: 'פוטנציאל תקש"אס 7-12/2026',
    sourceCell: "AB10",
    ...overrides,
  };
}

function parseResult(overrides: Partial<FairnessTableParseResult> = {}): FairnessTableParseResult {
  return {
    personRows: [row()],
    totals: null,
    targets: { supervisorTarget: 4, technicianTarget: 8 },
    ...overrides,
  };
}

const NOW = { date: "2026-08-13", minuteOfDay: 600 };

function build(overrides: Partial<Parameters<typeof buildManagerFairnessReadModel>[0]> = {}) {
  return buildManagerFairnessReadModel({
    manager: MANAGER,
    parseResult: parseResult(),
    period: "h2",
    fetchedAt: "2026-08-13T08:00:00.000Z",
    now: NOW,
    selectedPersonId: null,
    ...overrides,
  });
}

describe("buildManagerFairnessReadModel — the sheet's currentScore is never replaced", () => {
  it("currentScore/previousScore flow through untouched", () => {
    const model = build();
    expect(model.rows[0].currentScore).toBe(6);
    expect(model.rows[0].previousScore).toBe(5);
  });
});

describe("buildManagerFairnessReadModel — period + targets", () => {
  it("period label uses the year from `now`", () => {
    const model = build({ period: "h1", now: { date: "2026-03-01", minuteOfDay: 0 } });
    expect(model.period).toEqual({ key: "h1", label: "1–6/2026" });
  });

  it("targets are echoed as-is from the parse result", () => {
    const model = build();
    expect(model.targets).toEqual({ supervisorTarget: 4, technicianTarget: 8 });
  });
});

describe("buildManagerFairnessReadModel — analysis fields", () => {
  it("computes delta/target/gap/normalizedLoad for a technician row", () => {
    const model = build({
      parseResult: parseResult({ personRows: [row({ allocationLabel: "טכנאי", previousScore: 5, currentScore: 6 })] }),
    });
    const [view] = model.rows;
    expect(view.delta).toBeCloseTo(1);
    expect(view.comparisonTarget).toBe(8);
    expect(view.gapToTarget).toBeCloseTo(-2);
    expect(view.normalizedLoad).toBeCloseTo(0.75);
  });

  it("an unknown allocation label never gets an invented target", () => {
    const model = build({ parseResult: parseResult({ personRows: [row({ allocationLabel: 'ר"צ' })] }) });
    expect(model.rows[0].comparisonTarget).toBeNull();
    expect(model.rows[0].normalizedLoad).toBeNull();
  });

  it("resolves typed exemption applicability", () => {
    const model = build({
      parseResult: parseResult({ personRows: [row({ exemptions: ["שמירות", "מטבח"] })] }),
    });
    expect(model.rows[0].exemptions).toEqual([
      { raw: "שמירות", affectedDutyFamilies: ["guard"] },
      { raw: "מטבח", affectedDutyFamilies: ["daily_kitchen", "full_kitchen", "weekend_kitchen"] },
    ]);
  });

  it("an exempt person's raw/normalized score is retained unchanged -- exemptions never erase history", () => {
    const model = build({
      parseResult: parseResult({
        personRows: [row({ allocationLabel: "טכנאי", previousScore: 5, currentScore: 6, exemptions: ["שמירות"] })],
      }),
    });
    expect(model.rows[0].currentScore).toBe(6);
    expect(model.rows[0].previousScore).toBe(5);
    expect(model.rows[0].normalizedLoad).toBeCloseTo(0.75);
  });
});

describe("buildManagerFairnessReadModel — sorting (PR #15 §31)", () => {
  it("sorts ascending by normalized load", () => {
    const model = build({
      parseResult: parseResult({
        personRows: [
          row({ sourceName: "גבוה", allocationLabel: "טכנאי", currentScore: 7.6, resolvedPersonId: "p_high" }),
          row({ sourceName: "נמוך", allocationLabel: "טכנאי", currentScore: 2, resolvedPersonId: "p_low" }),
        ],
      }),
    });
    expect(model.rows.map((r) => r.sourceName)).toEqual(["נמוך", "גבוה"]);
  });

  it("rows with a normalized load sort before rows without one", () => {
    const model = build({
      parseResult: parseResult({
        personRows: [
          row({ sourceName: "בלי יעד", allocationLabel: 'ר"צ', currentScore: 1, resolvedPersonId: "p_none" }),
          row({ sourceName: "עם יעד", allocationLabel: "טכנאי", currentScore: 6, resolvedPersonId: "p_some" }),
        ],
      }),
    });
    expect(model.rows.map((r) => r.sourceName)).toEqual(["עם יעד", "בלי יעד"]);
  });

  it("stable tiebreak by source name when normalized load ties", () => {
    const model = build({
      parseResult: parseResult({
        personRows: [
          row({ sourceName: "ב", allocationLabel: "טכנאי", currentScore: 6, resolvedPersonId: "p_b" }),
          row({ sourceName: "א", allocationLabel: "טכנאי", currentScore: 6, resolvedPersonId: "p_a" }),
        ],
      }),
    });
    expect(model.rows.map((r) => r.sourceName)).toEqual(["א", "ב"]);
  });
});

describe("buildManagerFairnessReadModel — totals validation", () => {
  it("null totals from the parse result -> null totals view", () => {
    const model = build();
    expect(model.totals).toBeNull();
  });

  it("matching totals -> no discrepancy", () => {
    const model = build({
      parseResult: parseResult({
        personRows: [row({ previousScore: 5, currentScore: 6, weekendCount: 2 })],
        totals: {
          reportedPreviousTotal: 5,
          reportedCurrentTotal: 6,
          reportedWeekendTotal: 2,
          sourceSheet: "x",
          sourceCell: "A9",
        },
      }),
    });
    expect(model.totals?.hasDiscrepancy).toBe(false);
  });

  it("mismatched totals -> flagged, source total never silently corrected", () => {
    const model = build({
      parseResult: parseResult({
        personRows: [row({ previousScore: 5, currentScore: 6, weekendCount: 2 })],
        totals: {
          reportedPreviousTotal: 5,
          reportedCurrentTotal: 999,
          reportedWeekendTotal: 2,
          sourceSheet: "x",
          sourceCell: "A9",
        },
      }),
    });
    expect(model.totals?.hasDiscrepancy).toBe(true);
    expect(model.totals?.reportedCurrentTotal).toBe(999);
    expect(model.totals?.computedCurrentTotal).toBe(6);
  });
});

describe("buildManagerFairnessReadModel — chart slices (PR #15 §27/§44)", () => {
  it("one slice per row with a known currentScore, percentages sum to ~100", () => {
    const model = build({
      parseResult: parseResult({
        personRows: [
          row({ sourceName: "א", currentScore: 6, resolvedPersonId: "p_a" }),
          row({ sourceName: "ב", currentScore: 4, resolvedPersonId: "p_b" }),
        ],
      }),
    });
    expect(model.chartSlices).toHaveLength(2);
    const totalPercentage = model.chartSlices.reduce((sum, slice) => sum + slice.percentage, 0);
    expect(totalPercentage).toBeCloseTo(100);
  });

  it("null currentScore rows are excluded from the chart", () => {
    const model = build({
      parseResult: parseResult({
        personRows: [row({ sourceName: "א", currentScore: 6 }), row({ sourceName: "ב", currentScore: null })],
      }),
    });
    expect(model.chartSlices).toHaveLength(1);
    expect(model.chartSlices[0].name).toBe("א");
  });

  it("zero total -> empty chart, no division by zero", () => {
    const model = build({ parseResult: parseResult({ personRows: [row({ currentScore: null })] }) });
    expect(model.chartSlices).toEqual([]);
  });

  it("an exempt person is still included in the raw-score chart", () => {
    const model = build({
      parseResult: parseResult({ personRows: [row({ currentScore: 6, exemptions: ["שמירות"] })] }),
    });
    expect(model.chartSlices).toHaveLength(1);
  });

  it("chart slices never carry email/sourceSheet/sourceCell", () => {
    const model = build({ parseResult: parseResult({ personRows: [row({ currentScore: 6 })] }) });
    expect(JSON.stringify(model.chartSlices)).not.toContain("example.invalid");
    expect(JSON.stringify(model.chartSlices)).not.toContain("sourceSheet");
    expect(JSON.stringify(model.chartSlices)).not.toContain("sourceCell");
  });
});

describe("buildManagerFairnessReadModel — selected person resolution", () => {
  it("resolves a valid selected person id present among resolved rows", () => {
    const model = build({
      parseResult: parseResult({ personRows: [row({ resolvedPersonId: "p_martin" })] }),
      selectedPersonId: "p_martin",
    });
    expect(model.selectedPersonId).toBe("p_martin");
  });

  it("an unknown/invalid selected person id falls back to null (everyone)", () => {
    const model = build({ selectedPersonId: "not_a_real_person" });
    expect(model.selectedPersonId).toBeNull();
  });

  it("an unresolved row's own null personId is never selectable", () => {
    const model = build({
      parseResult: parseResult({ personRows: [row({ resolvedPersonId: null })] }),
      selectedPersonId: null,
    });
    expect(model.rows[0].personId).toBeNull();
  });
});

describe("buildManagerFairnessReadModel — privacy", () => {
  it("never leaks the manager's email or the row's sourceSheet/sourceCell", () => {
    const model = build();
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain("example.invalid");
    expect(serialized).not.toContain("sourceSheet");
    expect(serialized).not.toContain("sourceCell");
  });
});
