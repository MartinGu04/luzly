import { describe, expect, it } from "vitest";
import { buildShootingRangeManagerReadModel, type ManagerShootingRangePersonInput } from "./buildShootingRangeManagerReadModel";
import type { ShootingRangeQualificationReadModel } from "./buildShootingRangeQualificationReadModel";

function model(overrides: Partial<ShootingRangeQualificationReadModel> = {}): ShootingRangeQualificationReadModel {
  return {
    personId: "p1",
    baselineDate: "2026-06-01",
    baselineSource: "app",
    expiryDate: "2026-12-01",
    status: "valid",
    notRelevantReason: null,
    plannedRange: null,
    pendingSelfReport: null,
    history: [],
    ...overrides,
  };
}

// Technician by default -- every eligible row in the real feature is a supervisor or technician (or both); tests that don't care about roleGroup just get a stable default.
function personInput(overrides: Partial<ManagerShootingRangePersonInput> = {}): ManagerShootingRangePersonInput {
  return {
    personId: "p1",
    personName: "א",
    isSupervisor: false,
    isTechnician: true,
    avatarUrl: null,
    model: model(),
    ...overrides,
  };
}

describe("buildShootingRangeManagerReadModel", () => {
  it("summarizes counts and never flags a valid qualification with only a future planned renewal", () => {
    const result = buildShootingRangeManagerReadModel([
      personInput({ personId: "p1", personName: "א", model: model({ status: "valid" }) }),
      personInput({ personId: "p2", personName: "ב", model: model({ status: "valid", plannedRange: { rangeDate: "2027-01-01", status: "planned" } }) }),
      personInput({ personId: "p3", personName: "ג", model: model({ status: "expiring_soon" }) }),
      personInput({ personId: "p4", personName: "ד", model: model({ status: "expired" }) }),
      personInput({ personId: "p5", personName: "ה", model: model({ status: "none", baselineDate: null, expiryDate: null }) }),
    ]);

    expect(result.summary).toEqual({
      qualifiedCount: 3,
      nearingExpiryCount: 1,
      notQualifiedCount: 2,
      notRelevantCount: 0,
      totalCount: 5,
    });
    expect(result.rows.find((r) => r.personId === "p2")?.requiresAttention).toBe(false);
    expect(result.rows.find((r) => r.personId === "p3")?.requiresAttention).toBe(true);
    expect(result.rows.find((r) => r.personId === "p4")?.requiresAttention).toBe(true);
    expect(result.rows.find((r) => r.personId === "p5")?.requiresAttention).toBe(true);
  });

  describe("not_relevant (לא רלוונטי) -- never folded into red/green counts or דורשי טיפול", () => {
    it("counts a not_relevant row in its own notRelevantCount, never qualifiedCount/notQualifiedCount", () => {
      const result = buildShootingRangeManagerReadModel([
        personInput({ personId: "p1", model: model({ status: "valid" }) }),
        personInput({ personId: "p2", model: model({ status: "not_relevant", notRelevantReason: "פטור שמירות" }) }),
      ]);

      expect(result.summary).toEqual({
        qualifiedCount: 1,
        nearingExpiryCount: 0,
        notQualifiedCount: 0,
        notRelevantCount: 1,
        totalCount: 2,
      });
    });

    it("never sets requiresAttention for a not_relevant row, even with a past-due pending confirmation", () => {
      const result = buildShootingRangeManagerReadModel([
        personInput({
          model: model({
            status: "not_relevant",
            plannedRange: { rangeDate: "2026-01-01", status: "pending_confirmation" },
          }),
        }),
      ]);
      expect(result.rows[0].requiresAttention).toBe(false);
    });

    it("carries notRelevantReason through onto the row, and null when absent", () => {
      const withReason = buildShootingRangeManagerReadModel([
        personInput({ model: model({ status: "not_relevant", notRelevantReason: "פטור שמירות" }) }),
      ]);
      expect(withReason.rows[0].notRelevantReason).toBe("פטור שמירות");

      const withoutReason = buildShootingRangeManagerReadModel([
        personInput({ model: model({ status: "not_relevant", notRelevantReason: null }) }),
      ]);
      expect(withoutReason.rows[0].notRelevantReason).toBeNull();
    });
  });

  it("carries avatarUrl through onto the row, null when absent", () => {
    const withPhoto = buildShootingRangeManagerReadModel([personInput({ avatarUrl: "https://example.invalid/a.jpg" })]);
    expect(withPhoto.rows[0].avatarUrl).toBe("https://example.invalid/a.jpg");

    const withoutPhoto = buildShootingRangeManagerReadModel([personInput({ avatarUrl: null })]);
    expect(withoutPhoto.rows[0].avatarUrl).toBeNull();
  });

  it("flags a past-due pending confirmation as requiring attention even while the current baseline is still valid", () => {
    const result = buildShootingRangeManagerReadModel([
      personInput({
        personId: "p1",
        personName: "א",
        model: model({ status: "valid", plannedRange: { rangeDate: "2026-01-01", status: "pending_confirmation" } }),
      }),
    ]);
    expect(result.rows[0].requiresAttention).toBe(true);
  });

  it("defaults unresolvedSheetRowCount to 0 and unresolvedSheetRowNames to [], and otherwise passes both through verbatim", () => {
    const empty = buildShootingRangeManagerReadModel([]);
    expect(empty.unresolvedSheetRowCount).toBe(0);
    expect(empty.unresolvedSheetRowNames).toEqual([]);

    const withValues = buildShootingRangeManagerReadModel([], 2, ["שם לא ידוע", "שם אחר"]);
    expect(withValues.unresolvedSheetRowCount).toBe(2);
    expect(withValues.unresolvedSheetRowNames).toEqual(["שם לא ידוע", "שם אחר"]);
  });

  describe("roleGroup (canonical classifyRoleGroup precedence)", () => {
    it("classifies a supervisor-only person as 'supervisor'", () => {
      const result = buildShootingRangeManagerReadModel([personInput({ isSupervisor: true, isTechnician: false })]);
      expect(result.rows[0].roleGroup).toBe("supervisor");
    });

    it("classifies a technician-only person as 'technician'", () => {
      const result = buildShootingRangeManagerReadModel([personInput({ isSupervisor: false, isTechnician: true })]);
      expect(result.rows[0].roleGroup).toBe("technician");
    });

    it("a person who is BOTH supervisor and technician is classified as 'supervisor' only -- never duplicated, supervisor takes precedence (classifyRoleGroup's own canonical rule)", () => {
      const result = buildShootingRangeManagerReadModel([personInput({ isSupervisor: true, isTechnician: true })]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].roleGroup).toBe("supervisor");
    });
  });
});
