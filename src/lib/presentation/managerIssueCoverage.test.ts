import { describe, expect, it } from "vitest";
import type { ManagerShiftOverviewEntry } from "@/lib/readModels/managerTypes";
import { managerIssueCoverageReasonLabel } from "./managerIssueCoverage";

type RoleCoverage = ManagerShiftOverviewEntry["roleCoverage"];

function roleCoverage(overrides: Partial<RoleCoverage> = {}): RoleCoverage {
  return {
    technician: { status: "full", missingIntervals: [] },
    supervisor: { status: "full", missingIntervals: [] },
    ...overrides,
  };
}

const FALLBACK = "חסר כיסוי למשמרת";

describe("managerIssueCoverageReasonLabel", () => {
  it('technician missing alone -> "חסר טכנאי למשמרת"', () => {
    const rc = roleCoverage({ technician: { status: "missing", missingIntervals: [] } });
    expect(managerIssueCoverageReasonLabel(rc, FALLBACK)).toBe("חסר טכנאי למשמרת");
  });

  it('supervisor missing alone -> "חסר אחמ"ש למשמרת"', () => {
    const rc = roleCoverage({ supervisor: { status: "missing", missingIntervals: [] } });
    expect(managerIssueCoverageReasonLabel(rc, FALLBACK)).toBe('חסר אחמ"ש למשמרת');
  });

  it('both provably missing -> "חסרים טכנאי ואחמ"ש למשמרת"', () => {
    const rc = roleCoverage({
      technician: { status: "missing", missingIntervals: [] },
      supervisor: { status: "missing", missingIntervals: [] },
    });
    expect(managerIssueCoverageReasonLabel(rc, FALLBACK)).toBe('חסרים טכנאי ואחמ"ש למשמרת');
  });

  it('technician partial (neither fully missing) -> "כיסוי טכנאי חלקי במשמרת"', () => {
    const rc = roleCoverage({
      technician: { status: "partial", missingIntervals: [{ startMinute: 330, endMinute: 450 }] },
    });
    expect(managerIssueCoverageReasonLabel(rc, FALLBACK)).toBe("כיסוי טכנאי חלקי במשמרת");
  });

  it('supervisor partial (neither fully missing) -> "כיסוי אחמ"ש חלקי במשמרת"', () => {
    const rc = roleCoverage({
      supervisor: { status: "partial", missingIntervals: [{ startMinute: 330, endMinute: 450 }] },
    });
    expect(managerIssueCoverageReasonLabel(rc, FALLBACK)).toBe('כיסוי אחמ"ש חלקי במשמרת');
  });

  it("a missing role always outranks a partial role on the other side", () => {
    const rc = roleCoverage({
      technician: { status: "missing", missingIntervals: [] },
      supervisor: { status: "partial", missingIntervals: [{ startMinute: 330, endMinute: 450 }] },
    });
    expect(managerIssueCoverageReasonLabel(rc, FALLBACK)).toBe("חסר טכנאי למשמרת");
  });

  it("not_evaluable never invents a specific missing role -- falls back to the truthful generic label", () => {
    const rc = roleCoverage({
      technician: { status: "not_evaluable", missingIntervals: [] },
      supervisor: { status: "not_evaluable", missingIntervals: [] },
    });
    expect(managerIssueCoverageReasonLabel(rc, FALLBACK)).toBe(FALLBACK);
  });

  it("one not_evaluable role never blocks a provable missing role on the other side", () => {
    const rc = roleCoverage({
      technician: { status: "not_evaluable", missingIntervals: [] },
      supervisor: { status: "missing", missingIntervals: [] },
    });
    expect(managerIssueCoverageReasonLabel(rc, FALLBACK)).toBe('חסר אחמ"ש למשמרת');
  });

  it("both full falls back to the generic label (defensive -- should not normally be reached for a real issue)", () => {
    expect(managerIssueCoverageReasonLabel(roleCoverage(), FALLBACK)).toBe(FALLBACK);
  });
});
