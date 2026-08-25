import { describe, expect, it } from "vitest";
import { buildShootingRangeManagerReadModel } from "./buildShootingRangeManagerReadModel";
import type { ShootingRangeQualificationReadModel } from "./buildShootingRangeQualificationReadModel";

function model(overrides: Partial<ShootingRangeQualificationReadModel> = {}): ShootingRangeQualificationReadModel {
  return {
    personId: "p1",
    baselineDate: "2026-06-01",
    baselineSource: "app",
    expiryDate: "2026-12-01",
    status: "valid",
    plannedRange: null,
    pendingSelfReport: null,
    history: [],
    ...overrides,
  };
}

describe("buildShootingRangeManagerReadModel", () => {
  it("summarizes counts and never flags a valid qualification with only a future planned renewal", () => {
    const result = buildShootingRangeManagerReadModel([
      { personId: "p1", personName: "א", model: model({ status: "valid" }) },
      { personId: "p2", personName: "ב", model: model({ status: "valid", plannedRange: { rangeDate: "2027-01-01", status: "planned" } }) },
      { personId: "p3", personName: "ג", model: model({ status: "expiring_soon" }) },
      { personId: "p4", personName: "ד", model: model({ status: "expired" }) },
      { personId: "p5", personName: "ה", model: model({ status: "none", baselineDate: null, expiryDate: null }) },
    ]);

    expect(result.summary).toEqual({ qualifiedCount: 3, nearingExpiryCount: 1, notQualifiedCount: 2, totalCount: 5 });
    expect(result.rows.find((r) => r.personId === "p2")?.requiresAttention).toBe(false);
    expect(result.rows.find((r) => r.personId === "p3")?.requiresAttention).toBe(true);
    expect(result.rows.find((r) => r.personId === "p4")?.requiresAttention).toBe(true);
    expect(result.rows.find((r) => r.personId === "p5")?.requiresAttention).toBe(true);
  });

  it("flags a past-due pending confirmation as requiring attention even while the current baseline is still valid", () => {
    const result = buildShootingRangeManagerReadModel([
      {
        personId: "p1",
        personName: "א",
        model: model({ status: "valid", plannedRange: { rangeDate: "2026-01-01", status: "pending_confirmation" } }),
      },
    ]);
    expect(result.rows[0].requiresAttention).toBe(true);
  });

  it("defaults unresolvedSheetRowCount to 0 and otherwise passes it through verbatim", () => {
    expect(buildShootingRangeManagerReadModel([]).unresolvedSheetRowCount).toBe(0);
    expect(buildShootingRangeManagerReadModel([], 3).unresolvedSheetRowCount).toBe(3);
  });
});
