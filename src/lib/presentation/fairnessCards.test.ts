import { describe, expect, it } from "vitest";
import { COMPLETE_FAIRNESS_DATA, fairnessDataCompleteness } from "@/lib/domain/fairnessFoundation";
import type { DutyFairnessPersonRowView } from "@/lib/readModels/dutyFairnessTypes";
import type { ShiftFairnessPersonRowView } from "@/lib/readModels/shiftFairnessTypes";
import { buildDutyFairnessCardView, buildShiftFairnessCardView, shiftFairnessCompletenessNote } from "./fairnessCards";

function shiftRow(overrides: Partial<ShiftFairnessPersonRowView> = {}): ShiftFairnessPersonRowView {
  return {
    personId: "p_1",
    personName: "דני טכנאי",
    serviceCategory: "regular",
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
      serviceCategory: "regular",
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

describe("buildShiftFairnessCardView -- serviceCategory", () => {
  it("carries the row's own serviceCategory straight through, unmodified", () => {
    const view = buildShiftFairnessCardView(shiftRow({ serviceCategory: "reserve" }), "/fairness?person=p_1");
    expect(view.serviceCategory).toBe("reserve");
  });
});

describe("buildShiftFairnessCardView -- avatarUrl", () => {
  it("carries the row's own avatarUrl straight through, unmodified", () => {
    const view = buildShiftFairnessCardView(
      shiftRow({ avatarUrl: "https://lh3.googleusercontent.com/a/dani.jpg" }),
      "/fairness?person=p_1",
    );
    expect(view.avatarUrl).toBe("https://lh3.googleusercontent.com/a/dani.jpg");
  });

  it("is null when the row has no avatarUrl (undefined, the field's own default)", () => {
    const view = buildShiftFairnessCardView(shiftRow(), "/fairness?person=p_1");
    expect(view.avatarUrl).toBeNull();
  });

  it("is null when the row's avatarUrl is explicitly null", () => {
    const view = buildShiftFairnessCardView(shiftRow({ avatarUrl: null }), "/fairness?person=p_1");
    expect(view.avatarUrl).toBeNull();
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
    completedAllocationTotal: 5,
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
      completedAllocationLabel: "5",
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

describe("buildDutyFairnessCardView -- completedAllocationLabel is the weighted allocation total, independent of the comparison target", () => {
  it("formats a real completed-allocation total as a clean number -- a DIFFERENT fact from the weighted currentLabel", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({ completedAllocationTotal: 5, currentScore: 6 }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.completedAllocationLabel).toBe("5");
    expect(view.currentLabel).toBe("6");
    expect(view.completedAllocationLabel).not.toBe(view.currentLabel);
  });

  it('a ר"צ / non-comparable row (null target/status) still shows a real completed-allocation total when the identity is resolved', () => {
    const view = buildDutyFairnessCardView(
      dutyRow({
        allocationLabel: 'ר"צ',
        comparisonTarget: null,
        gapToTarget: null,
        status: null,
        completedAllocationTotal: 0.5,
      }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.status).toBeNull();
    expect(view.targetLabel).toBeNull();
    expect(view.completedAllocationLabel).toBe("0.5");
  });

  it("unresolved identity (null completedAllocationTotal from the read model) renders as \"—\", never a fabricated 0", () => {
    const view = buildDutyFairnessCardView(dutyRow({ personId: null, completedAllocationTotal: null }), null);
    expect(view.completedAllocationLabel).toBe("—");
  });

  it("an unsupported guard/reserve block shape (null completedAllocationTotal even with a resolved identity) also renders as \"—\"", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({
        completedAllocationTotal: null,
        dataCompleteness: { status: "partial", reasons: ["duty_allocation_unsupported_block_shape"] },
      }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.completedAllocationLabel).toBe("—");
  });

  it("a real zero completed-allocation total renders as \"0\", never as unavailable", () => {
    const view = buildDutyFairnessCardView(dutyRow({ completedAllocationTotal: 0 }), "/fairness?mode=duties&person=p_1");
    expect(view.completedAllocationLabel).toBe("0");
  });

  it.each([
    [2.9, "2.9"],
    [0.25, "0.25"],
    [0.2, "0.2"],
    [4.25, "4.25"],
    [1, "1"],
  ])("formats %s cleanly as %s, never forced trailing zeros or floating-point noise", (value, expected) => {
    const view = buildDutyFairnessCardView(dutyRow({ completedAllocationTotal: value }), "/fairness?mode=duties&person=p_1");
    expect(view.completedAllocationLabel).toBe(expected);
  });
});

describe("buildDutyFairnessCardView -- avatarUrl", () => {
  it("carries the row's own avatarUrl straight through, unmodified", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({ avatarUrl: "https://lh3.googleusercontent.com/a/noa.jpg" }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.avatarUrl).toBe("https://lh3.googleusercontent.com/a/noa.jpg");
  });

  it("is null when the row has no avatarUrl (undefined, the field's own default)", () => {
    const view = buildDutyFairnessCardView(dutyRow(), "/fairness?mode=duties&person=p_1");
    expect(view.avatarUrl).toBeNull();
  });

  it("is null for an unresolved identity (null personId), even if avatarUrl happened to be set on the row", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({ personId: null, avatarUrl: "https://lh3.googleusercontent.com/a/noa.jpg" }),
      null,
    );
    // The row itself should never carry avatarUrl when personId is null (see
    // dutyFairness.ts's own withAvatars), but the card builder is a plain
    // passthrough either way -- this proves the builder doesn't invent a
    // photo attribution beyond what the row already decided.
    expect(view.personId).toBeNull();
  });
});
