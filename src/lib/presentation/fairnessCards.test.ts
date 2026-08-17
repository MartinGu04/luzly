import { describe, expect, it } from "vitest";
import { COMPLETE_FAIRNESS_DATA, fairnessDataCompleteness } from "@/lib/domain/fairnessFoundation";
import type { DutyFairnessPersonRowView } from "@/lib/readModels/dutyFairnessTypes";
import type { ShiftFairnessPersonRowView } from "@/lib/readModels/shiftFairnessTypes";
import { buildDutyFairnessCardView, buildShiftFairnessCardView, shiftFairnessCompletenessNote } from "./fairnessCards";

function shiftRow(overrides: Partial<ShiftFairnessPersonRowView> = {}): ShiftFairnessPersonRowView {
  return {
    personId: "p_1",
    personName: "דני טכנאי",
    actualShifts: 4,
    target: 4.3,
    deviation: -0.3,
    status: "balanced",
    weekendActualShifts: 1,
    weekendTarget: 1.2,
    weekendDeviation: -0.2,
    weekendStatus: "balanced",
    dataCompleteness: COMPLETE_FAIRNESS_DATA,
    ...overrides,
  };
}

describe("buildShiftFairnessCardView", () => {
  it("formats a fully modelable row -- real numbers, no unavailable note", () => {
    const view = buildShiftFairnessCardView(shiftRow(), "/fairness?person=p_1");
    expect(view).toMatchObject({
      key: "p_1",
      personId: "p_1",
      personName: "דני טכנאי",
      href: "/fairness?person=p_1",
      actualLabel: "4",
      targetLabel: "4.3",
      deviationLabel: "-0.3",
      status: "balanced",
      weekendActualLabel: "1",
      weekendTargetLabel: "1.2",
      unavailableNote: null,
    });
  });

  it("an unmodelable target -> unavailableNote set, never a fake 0/balanced -- actual work stays visible", () => {
    const view = buildShiftFairnessCardView(
      shiftRow({
        target: null,
        deviation: null,
        status: null,
        weekendTarget: null,
        weekendDeviation: null,
        weekendStatus: null,
        dataCompleteness: fairnessDataCompleteness(["shift_target_unmodelable_evidence_only"]),
      }),
      "/fairness?person=p_1",
    );
    expect(view.targetLabel).toBeNull();
    expect(view.deviationLabel).toBeNull();
    expect(view.status).toBeNull();
    expect(view.actualLabel).toBe("4");
    expect(view.unavailableNote).toBe("לא ניתן לחשב יעד מלא לתקופה זו");
    expect(view.completenessNote).not.toBeNull();
  });
});

describe("shiftFairnessCompletenessNote", () => {
  it("returns a concrete explanation for a meaningful reason", () => {
    expect(shiftFairnessCompletenessNote(["shift_target_unmodelable_historical"])).toContain("תקופה שכבר הסתיימה");
  });

  it("returns null for reasons that don't materially affect what's shown here", () => {
    expect(shiftFairnessCompletenessNote(["eligibility_undated", "participation_inferred"])).toBeNull();
  });

  it("returns null for an empty reason list", () => {
    expect(shiftFairnessCompletenessNote([])).toBeNull();
  });

  it("picks the first meaningful reason among several", () => {
    expect(shiftFairnessCompletenessNote(["eligibility_undated", "shift_target_no_group_opportunities"])).toContain(
      "לא נמצאה בנתונים הזדמנות תואמת",
    );
  });
});

function dutyRow(overrides: Partial<DutyFairnessPersonRowView> = {}): DutyFairnessPersonRowView {
  return {
    key: "p_1-0",
    personId: "p_1",
    sourceName: "נועה טכנאית",
    allocationLabel: "טכנאי",
    previousScore: 5,
    currentScore: 6,
    delta: 1,
    comparisonTarget: 8,
    gapToTarget: -2,
    normalizedLoad: 0.75,
    status: "below",
    weekendCount: 2,
    exemptions: [],
    dataCompleteness: COMPLETE_FAIRNESS_DATA,
    ...overrides,
  };
}

describe("buildDutyFairnessCardView", () => {
  it("formats a target-bearing row", () => {
    const view = buildDutyFairnessCardView(dutyRow(), "/fairness?mode=duties&person=p_1");
    expect(view).toMatchObject({
      key: "p_1-0",
      personId: "p_1",
      personName: "נועה טכנאית",
      href: "/fairness?mode=duties&person=p_1",
      allocationLabel: "טכנאי",
      currentLabel: "6",
      targetLabel: "8",
      deltaLabel: "+1.00",
      status: "below",
      weekendLabel: "2",
    });
  });

  it('a ר"צ row -- null target/status, real score/weekend preserved, exact per the decided grouping rule', () => {
    const view = buildDutyFairnessCardView(
      dutyRow({ allocationLabel: 'ר"צ', comparisonTarget: null, gapToTarget: null, status: null, currentScore: 5 }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.targetLabel).toBeNull();
    expect(view.gapLabel).toBeNull();
    expect(view.status).toBeNull();
    expect(view.currentLabel).toBe("5");
  });

  it("no href for an unresolved identity (null personId)", () => {
    const view = buildDutyFairnessCardView(dutyRow({ personId: null }), null);
    expect(view.href).toBeNull();
    expect(view.personId).toBeNull();
  });

  it("exemptions map through exemptionBadgeLabel", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({ exemptions: [{ raw: "מטבח", affectedDutyFamilies: ["daily_kitchen", "full_kitchen", "weekend_kitchen"] }] }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.exemptionBadges).toEqual(["🚫 מטבח"]);
  });
});
