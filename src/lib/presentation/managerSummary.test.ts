import { describe, expect, it } from "vitest";
import { managerSummaryLabel } from "./managerSummary";

function emptyModel() {
  return { coverageOverview: [], duties: [], absences: [], issues: [], potentialRequirements: [] };
}

describe("managerSummaryLabel", () => {
  it("returns null when everything is empty", () => {
    expect(managerSummaryLabel(emptyModel())).toBeNull();
  });

  it("counts shift assignments across every role/shadow list in coverageOverview", () => {
    const model = {
      ...emptyModel(),
      coverageOverview: [
        {
          date: "2026-08-13",
          period: "day" as const,
          technicians: [{ personId: "a", personName: "a", certainty: "confirmed" as const, startTimeOverride: null, endTimeOverride: null }],
          supervisors: [{ personId: "b", personName: "b", certainty: "confirmed" as const, startTimeOverride: null, endTimeOverride: null }],
          shadowTechnicians: [],
          shadowSupervisors: [{ personId: "c", personName: "c", certainty: "confirmed" as const, startTimeOverride: null, endTimeOverride: null }],
          coverageStatus: "full" as const,
          missingIntervals: [],
          roleCoverage: {
            technician: { status: "full" as const, missingIntervals: [] },
            supervisor: { status: "full" as const, missingIntervals: [] },
          },
        },
      ],
    };
    expect(managerSummaryLabel(model)).toBe("3 משמרות");
  });

  it("counts duties and absences", () => {
    const model = {
      ...emptyModel(),
      duties: [{ personId: "a", personName: "a", date: "2026-08-13", dutyFamily: "guard" as const, slot: 1, certainty: "confirmed" as const }],
      absences: [
        { personId: "b", personName: "b", date: "2026-08-13", absenceKind: "vacation" as const, certainty: "confirmed" as const },
        { personId: "c", personName: "c", date: "2026-08-13", absenceKind: "medical" as const, certainty: "confirmed" as const },
      ],
    };
    expect(managerSummaryLabel(model)).toBe("1 תורנויות · 2 היעדרויות");
  });

  it("counts critical and review issues separately, never info in the summary math (info still 0 here)", () => {
    const model = {
      ...emptyModel(),
      issues: [
        { personId: "a", personName: "a", reason: "shift_coverage_missing" as const, severity: "critical" as const, date: "2026-08-13", missingIntervals: null, metadata: null, targetEvent: null, recommendation: null },
        { personId: "b", personName: "b", reason: "invalid_shift_time" as const, severity: "review" as const, date: "2026-08-13", missingIntervals: null, metadata: null, targetEvent: null, recommendation: null },
        { personId: "c", personName: "c", reason: "invalid_shift_time" as const, severity: "review" as const, date: "2026-08-13", missingIntervals: null, metadata: null, targetEvent: null, recommendation: null },
      ],
    };
    expect(managerSummaryLabel(model)).toBe("1 דחופים · 2 לבדיקה");
  });

  it("counts missing/partial potential requirements, never not_evaluable ones", () => {
    const model = {
      ...emptyModel(),
      potentialRequirements: [
        { date: "2026-08-13", dutyFamily: "guard" as const, slot: 1, columnLabel: "x", sourceAllocationLabel: "y", resolvedSourcePersonId: "a", resolvedSourcePersonName: "a", status: "missing" as const, actualAssignees: [], sourceConflict: "blocking_absence" as const },
        { date: "2026-08-13", dutyFamily: "guard" as const, slot: 2, columnLabel: "x", sourceAllocationLabel: "z", resolvedSourcePersonId: null, resolvedSourcePersonName: null, status: "not_evaluable" as const, actualAssignees: [], sourceConflict: null },
      ],
    };
    expect(managerSummaryLabel(model)).toBe("דרישת Potential אחת חסרה");
  });

  it("pluralizes the potential-missing count", () => {
    const model = {
      ...emptyModel(),
      potentialRequirements: [
        { date: "2026-08-13", dutyFamily: "guard" as const, slot: 1, columnLabel: "x", sourceAllocationLabel: "y", resolvedSourcePersonId: "a", resolvedSourcePersonName: "a", status: "missing" as const, actualAssignees: [], sourceConflict: "blocking_absence" as const },
        { date: "2026-08-14", dutyFamily: "guard" as const, slot: 2, columnLabel: "x", sourceAllocationLabel: "y", resolvedSourcePersonId: "a", resolvedSourcePersonName: "a", status: "partial" as const, actualAssignees: [], sourceConflict: null },
      ],
    };
    expect(managerSummaryLabel(model)).toBe("2 דרישות Potential חסרות");
  });

  it("combines every non-zero fact in order", () => {
    const model = {
      coverageOverview: [
        {
          date: "2026-08-13",
          period: "day" as const,
          technicians: [{ personId: "a", personName: "a", certainty: "confirmed" as const, startTimeOverride: null, endTimeOverride: null }],
          supervisors: [],
          shadowTechnicians: [],
          shadowSupervisors: [],
          coverageStatus: "missing" as const,
          missingIntervals: [],
          roleCoverage: {
            technician: { status: "full" as const, missingIntervals: [] },
            supervisor: { status: "missing" as const, missingIntervals: [] },
          },
        },
      ],
      duties: [{ personId: "a", personName: "a", date: "2026-08-13", dutyFamily: "guard" as const, slot: null, certainty: "confirmed" as const }],
      absences: [],
      issues: [
        { personId: "a", personName: "a", reason: "shift_coverage_missing" as const, severity: "critical" as const, date: "2026-08-13", missingIntervals: null, metadata: null, targetEvent: null, recommendation: null },
      ],
      potentialRequirements: [],
    };
    expect(managerSummaryLabel(model)).toBe("1 משמרות · 1 תורנויות · 1 דחופים");
  });
});
