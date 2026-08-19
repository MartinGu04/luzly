import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import type { FairnessPersonRow, FairnessTableParseResult, FairnessTargets, FairnessTotalsRow } from "@/lib/domain/fairnessTable";
import { buildDutyFairnessReadModel } from "./buildDutyFairnessReadModel";

function dutyEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p1",
    personName: "מרטין בדיקה",
    date: "2026-03-10",
    title: "שמירה",
    rawValue: "שמירה",
    category: "duty",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "sheet",
    sourceCell: "A1",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: "guard",
    absenceKind: null,
    ...overrides,
  };
}

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
    sourceCell: "Y10",
    ...overrides,
  };
}

const EMPTY_TARGETS: FairnessTargets = { supervisorTarget: null, technicianTarget: null };

function parseResult(overrides: Partial<FairnessTableParseResult> = {}): FairnessTableParseResult {
  return { personRows: [], totals: null, targets: EMPTY_TARGETS, ...overrides };
}

const NOW: LocalNow = { date: "2026-08-15", minuteOfDay: 600 };

describe("buildDutyFairnessReadModel — period (K)", () => {
  it("H1 of the current year, with today inside it, is reported current", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult(),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.period).toEqual({ key: "h1", year: 2026, label: "1–6/2026", status: "closed" });
  });

  it("H2 of the current year, with today inside it, is reported current", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult(),
      periodIdentity: { key: "h2", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.period.status).toBe("current");
  });

  it("a past year's H2 is reported closed via the SHARED foundation logic, not a duplicated computation", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult(),
      periodIdentity: { key: "h2", year: 2025 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.period).toEqual({ key: "h2", year: 2025, label: "7–12/2025", status: "closed" });
  });

  it("a future year's H1 is reported current", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult(),
      periodIdentity: { key: "h1", year: 2027 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.period.status).toBe("current");
  });

  it("carries the shared FAIRNESS_MODEL_VERSION", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult(),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.fairnessModelVersion).toBe(1);
  });
});

describe("buildDutyFairnessReadModel — E. existing deterministic target mapping preserved", () => {
  const targets: FairnessTargets = { supervisorTarget: 4, technicianTarget: 8 };

  it("a technician row gets the technician target", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ allocationLabel: "טכנאי", currentScore: 6 })],
        targets,
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.comparisonTarget).toBe(8);
    expect(row?.status).toBe("below");
  });

  it('a supervisor row (\'אחמ"ש\') gets the supervisor target', () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ allocationLabel: 'אחמ"ש', currentScore: 4 })],
        targets,
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "supervisor")?.rows[0];
    expect(row?.comparisonTarget).toBe(4);
    expect(row?.status).toBe("balanced");
  });

  it("an unknown/non-target-bearing allocation label never receives an invented target, even though period targets are known", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ allocationLabel: "הסמכה", currentScore: 3 })],
        targets,
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "other")?.rows[0];
    expect(row?.comparisonTarget).toBeNull();
    expect(row?.status).toBeNull();
    // Not target-bearing at all -- this is the normal, complete outcome, not a flagged gap.
    expect(row?.dataCompleteness.reasons).not.toContain("duty_target_unavailable");
  });

  it("a target-bearing role whose period target note is missing is flagged, not silently zeroed", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ allocationLabel: "טכנאי", currentScore: 6 })],
        targets: EMPTY_TARGETS,
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.comparisonTarget).toBeNull();
    expect(row?.status).toBeNull();
    expect(row?.dataCompleteness.status).toBe("partial");
    expect(row?.dataCompleteness.reasons).toContain("duty_target_unavailable");
  });
});

describe("buildDutyFairnessReadModel — F. grouping vs target eligibility are separate facts", () => {
  it('a \'ר"צ\'-labeled row belongs to the SUPERVISOR presentation group (a decided domain rule), but that grouping alone grants it no target', () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ allocationLabel: 'ר"צ', currentScore: 5, weekendCount: 1, exemptions: ["מטבח"] })],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.groups.map((g) => g.key)).toEqual(["supervisor"]);
    const row = model.groups[0].rows[0];
    // Real workbook scores/weekend/exemptions still fully preserved.
    expect(row.currentScore).toBe(5);
    expect(row.weekendCount).toBe(1);
    expect(row.exemptions).toEqual([{ raw: "מטבח", affectedDutyFamilies: ["daily_kitchen", "full_kitchen", "weekend_kitchen"] }]);
    // But grouping alone never grants a target -- 'ר"צ' is not a target-bearing label.
    expect(row.comparisonTarget).toBeNull();
    expect(row.gapToTarget).toBeNull();
    expect(row.normalizedLoad).toBeNull();
    expect(row.status).toBeNull();
    // Not a genuine target gap either -- this is the normal, expected outcome for a non-target-bearing label.
    expect(row.dataCompleteness.reasons).not.toContain("duty_target_unavailable");
  });

  it('a \'ר"צ\'-labeled row sits alongside real \'אחמ"ש\' rows in the SAME supervisor group', () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [
          personRow({ resolvedPersonId: "p_rats", sourceName: "רס", allocationLabel: 'ר"צ', currentScore: 5 }),
          personRow({ resolvedPersonId: "p_sup", sourceName: "אחמש", allocationLabel: 'אחמ"ש', currentScore: 4 }),
        ],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.groups.map((g) => g.key)).toEqual(["supervisor"]);
    const supervisorGroup = model.groups.find((g) => g.key === "supervisor");
    expect(supervisorGroup?.rows).toHaveLength(2);
    const ratzRow = supervisorGroup?.rows.find((r) => r.allocationLabel === 'ר"צ');
    const supRow = supervisorGroup?.rows.find((r) => r.allocationLabel === 'אחמ"ש');
    expect(ratzRow?.comparisonTarget).toBeNull();
    expect(supRow?.comparisonTarget).toBe(4);
  });

  it("groups omit entirely when empty -- no invented empty supervisor/technician bucket", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ allocationLabel: "טכנאי" })],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.groups.map((g) => g.key)).toEqual(["technician"]);
  });

  it("orders groups supervisor, technician, other when all three are present", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [
          personRow({ resolvedPersonId: "p_a", allocationLabel: "הסמכה" }),
          personRow({ resolvedPersonId: "p_b", allocationLabel: "טכנאי" }),
          personRow({ resolvedPersonId: "p_c", allocationLabel: 'אחמ"ש' }),
        ],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.groups.map((g) => g.key)).toEqual(["supervisor", "technician", "other"]);
  });
});

describe("buildDutyFairnessReadModel — G. exemptions are descriptive and never rewrite history", () => {
  it("an exemption is preserved, previous/current scores stay untouched, and status is not force-rewritten", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [
          personRow({
            allocationLabel: "טכנאי",
            previousScore: 5,
            currentScore: 6,
            exemptions: ["מטבח"],
          }),
        ],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.exemptions).toEqual([{ raw: "מטבח", affectedDutyFamilies: ["daily_kitchen", "full_kitchen", "weekend_kitchen"] }]);
    expect(row?.previousScore).toBe(5);
    expect(row?.currentScore).toBe(6);
    expect(row?.delta).toBe(1);
    // The exemption alone does not force any particular status -- it's a normal below/balanced/above from the real scores.
    expect(row?.status).toBe("below");
  });
});

describe("buildDutyFairnessReadModel — D. missing previous score", () => {
  it("null previous score -> null delta, never treated as 0, while current score/target/status still compute normally", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ allocationLabel: "טכנאי", previousScore: null, currentScore: 8 })],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.previousScore).toBeNull();
    expect(row?.delta).toBeNull();
    expect(row?.currentScore).toBe(8);
    expect(row?.status).toBe("balanced");
  });
});

describe("buildDutyFairnessReadModel — H. weekend count preserved, never a Shift Fairness weekend computation", () => {
  it("the source weekend count flows through untouched", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ allocationLabel: "טכנאי", weekendCount: 3 })],
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.weekendCount).toBe(3);
  });

  it("unavailable weekend count stays null, never 0", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ allocationLabel: "טכנאי", weekendCount: null })],
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.weekendCount).toBeNull();
  });
});

describe("buildDutyFairnessReadModel — I. totals: reported vs displayed are separate facts", () => {
  it("reported totals pass through untouched; displayed sums are independently computed; a difference is never labeled an error", () => {
    const totals: FairnessTotalsRow = {
      reportedPreviousTotal: 90,
      reportedCurrentTotal: 100,
      reportedWeekendTotal: 20,
      sourceSheet: "sheet",
      sourceCell: "Y30",
    };
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [
          personRow({ resolvedPersonId: "p_a", previousScore: 5, currentScore: 6, weekendCount: 2 }),
          personRow({ resolvedPersonId: "p_b", previousScore: 5, currentScore: 6, weekendCount: 2 }),
        ],
        totals,
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.totals).toEqual({
      reportedPreviousTotal: 90,
      reportedCurrentTotal: 100,
      reportedWeekendTotal: 20,
      displayedPreviousSum: 10,
      displayedCurrentSum: 12,
      displayedWeekendSum: 4,
    });
    expect(model.totals).not.toHaveProperty("hasDiscrepancy");
  });

  it("no totals row in the source -> null, not a fabricated zero total", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({ personRows: [personRow()] }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    expect(model.totals).toBeNull();
  });
});

describe("buildDutyFairnessReadModel — unresolved identity stays visible, flagged, not discarded", () => {
  it("resolvedPersonId null -> personId null, row still fully displays with a real score/target, and the row is flagged", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ resolvedPersonId: null, allocationLabel: "טכנאי", currentScore: 6 })],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.personId).toBeNull();
    expect(row?.currentScore).toBe(6);
    expect(row?.comparisonTarget).toBe(8);
    expect(row?.status).toBe("below");
    expect(row?.dataCompleteness.reasons).toContain("duty_identity_unresolved");
  });
});

describe("buildDutyFairnessReadModel — J. privacy: presentation-safe, no source implementation details", () => {
  it("no row carries email, sourceSheet, sourceCell, or any raw sheet array", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ allocationLabel: "טכנאי" })],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row).not.toHaveProperty("email");
    expect(row).not.toHaveProperty("sourceSheet");
    expect(row).not.toHaveProperty("sourceCell");
    expect(JSON.stringify(model)).not.toContain("sourceCell");
    expect(JSON.stringify(model)).not.toContain("sourceSheet");
  });

  it("the row key never embeds a raw sheet cell reference", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ resolvedPersonId: "p1", sourceCell: "Y42", allocationLabel: "טכנאי" })],
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.key).not.toContain("Y42");
    expect(row?.key).toBe("p1-0");
  });
});

describe("buildDutyFairnessReadModel — sorting: established ordering preserved (lowest normalized load first, unavailable last)", () => {
  it("sorts ascending by normalized load, unavailable-target rows after every modelable row, stable tie-break", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [
          personRow({ resolvedPersonId: "p_high", sourceName: "גבוה", allocationLabel: "טכנאי", currentScore: 7 }), // 7/8
          personRow({ resolvedPersonId: "p_low", sourceName: "נמוך", allocationLabel: "טכנאי", currentScore: 2 }), // 2/8
          personRow({ resolvedPersonId: "p_none", sourceName: "אין יעד", allocationLabel: "הסמכה", currentScore: 5 }), // no target
        ],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const allRows = model.groups.flatMap((g) => g.rows);
    expect(allRows.map((r) => r.sourceName)).toEqual(["נמוך", "גבוה", "אין יעד"]);
  });
});

describe("buildDutyFairnessReadModel — completedDutyCount: raw, unweighted, independent of the workbook score", () => {
  it("derives the count from real schedule Events for the row's resolved person, distinct from the weighted currentScore", () => {
    const events: Event[] = [
      dutyEvent({ personId: "p1", date: "2026-01-10" }),
      dutyEvent({ personId: "p1", date: "2026-02-15" }),
      dutyEvent({ personId: "p1", date: "2026-03-20" }),
      dutyEvent({ personId: "p1", date: "2026-04-25" }),
      dutyEvent({ personId: "p1", date: "2026-05-30" }),
    ];
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ resolvedPersonId: "p1", allocationLabel: "טכנאי", currentScore: 6 })],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
      events,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.completedDutyCount).toBe(5);
    expect(row?.currentScore).toBe(6);
    expect(row?.completedDutyCount).not.toBe(row?.currentScore);
  });

  it("never counts a future/planned duty, even inside the selected period", () => {
    const events: Event[] = [
      dutyEvent({ personId: "p1", date: "2026-08-14" }), // completed, before NOW (2026-08-15)
      dutyEvent({ personId: "p1", date: "2026-12-20" }), // still inside h2, but in the future relative to NOW
    ];
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ resolvedPersonId: "p1", allocationLabel: "טכנאי" })],
      }),
      periodIdentity: { key: "h2", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
      events,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.completedDutyCount).toBe(1);
  });

  it("respects the SELECTED fairness period -- a duty from the other half-year is excluded", () => {
    const events: Event[] = [
      dutyEvent({ personId: "p1", date: "2026-03-01" }), // H1
      dutyEvent({ personId: "p1", date: "2026-08-01" }), // H2 -- not H1
    ];
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ resolvedPersonId: "p1", allocationLabel: "טכנאי" })],
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
      events,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.completedDutyCount).toBe(1);
  });

  it('a non-comparable person (e.g. \'ר"צ\', null target/status) still shows a real completed-duty count when the identity is resolved', () => {
    const events: Event[] = [dutyEvent({ personId: "p_rats", date: "2026-02-01" }), dutyEvent({ personId: "p_rats", date: "2026-03-01" })];
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ resolvedPersonId: "p_rats", sourceName: "רס", allocationLabel: 'ר"צ', currentScore: 5 })],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
      events,
    });
    const row = model.groups.find((g) => g.key === "supervisor")?.rows[0];
    expect(row?.status).toBeNull();
    expect(row?.comparisonTarget).toBeNull();
    expect(row?.completedDutyCount).toBe(2);
  });

  it("an unresolved source name (personId null) gets a null completedDutyCount, never a fabricated 0", () => {
    const events: Event[] = [dutyEvent({ personId: "p1", date: "2026-02-01" })];
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ resolvedPersonId: null, allocationLabel: "טכנאי", currentScore: 6 })],
        targets: { supervisorTarget: 4, technicianTarget: 8 },
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
      events,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.personId).toBeNull();
    expect(row?.completedDutyCount).toBeNull();
  });

  it("no events supplied (default []) -> 0 for a resolved person, never a crash", () => {
    const model = buildDutyFairnessReadModel({
      parseResult: parseResult({
        personRows: [personRow({ resolvedPersonId: "p1", allocationLabel: "טכנאי" })],
      }),
      periodIdentity: { key: "h1", year: 2026 },
      fetchedAt: "2026-08-15T10:00:00.000Z",
      now: NOW,
    });
    const row = model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(row?.completedDutyCount).toBe(0);
  });
});
