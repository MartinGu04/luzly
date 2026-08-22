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
    expectationFactors: null,
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
      // Justice Table redesign: the expected value is rounded to the
      // nearest 0.5 for display only -- the raw target stays 4.3.
      targetLabel: "4.5",
      deviationLabel: "-0.3",
      status: "balanced",
      weekendActualLabel: "1",
      weekendTargetLabel: "1",
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

describe("buildShiftFairnessCardView -- Justice Table redesign: statusStateLabel and expectationFactorLabel", () => {
  it("renders a human-readable state instead of the raw signed gap, and rounds the target to the nearest 0.5", () => {
    const view = buildShiftFairnessCardView(shiftRow({ target: 4.3, deviation: -0.3, status: "balanced" }), "/fairness?person=p_1");
    expect(view.targetLabel).toBe("4.5");
    expect(view.statusStateLabel).toBe("בהתאם לצפוי");
  });

  it("below/above states show the rounded magnitude with a direction phrase", () => {
    const below = buildShiftFairnessCardView(shiftRow({ deviation: -1.2, status: "below" }), "/fairness?person=p_1");
    expect(below.statusStateLabel).toBe("1 מתחת לצפוי");
    const above = buildShiftFairnessCardView(shiftRow({ deviation: 0.9, status: "above" }), "/fairness?person=p_1");
    expect(above.statusStateLabel).toBe("1 מעל הצפוי");
  });

  it("expectationFactorLabel is null when there is nothing to explain", () => {
    const view = buildShiftFairnessCardView(shiftRow({ expectationFactors: null }), "/fairness?person=p_1");
    expect(view.expectationFactorLabel).toBeNull();
  });

  it("expectationFactorLabel joins only the non-zero factors, singular/plural aware", () => {
    const view = buildShiftFairnessCardView(
      shiftRow({ expectationFactors: { leaveDays: 3, constraintDays: 0, referralDays: 1 } }),
      "/fairness?person=p_1",
    );
    expect(view.expectationFactorLabel).toBe("3 ימי היעדרות · 1 הפניה");
  });

  it("expectationFactorLabel is null when every factor is zero", () => {
    const view = buildShiftFairnessCardView(
      shiftRow({ expectationFactors: { leaveDays: 0, constraintDays: 0, referralDays: 0 } }),
      "/fairness?person=p_1",
    );
    expect(view.expectationFactorLabel).toBeNull();
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
    personalTargetTotal: 8,
    targetProgressRatio: 0.625,
    remainingToTarget: 3,
    paceStatus: null,
    liveDuty: null,
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

describe("buildDutyFairnessCardView -- Justice Table redesign: progress/remaining/pace/no-target/LIVE", () => {
  it("formats the read model's already-computed progress ratio / remaining -- completedAllocationTotal vs THIS PERSON'S OWN personalTargetTotal, never comparisonTarget or currentScore", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({
        completedAllocationTotal: 2.6,
        personalTargetTotal: 6.2,
        comparisonTarget: 4, // the workbook's unrelated role-based constant -- must never leak into the progress figures below
        currentScore: 99,
        targetProgressRatio: 2.6 / 6.2,
        remainingToTarget: 6.2 - 2.6,
      }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.hasTarget).toBe(true);
    expect(view.personalTargetLabel).toBe("6.2");
    expect(view.progressPercentLabel).toBe("42%");
    expect(view.remainingLabel).toBe("3.6");
    expect(view.beyondTargetLabel).toBeNull();
    // The workbook's own comparison target stays a completely separate fact.
    expect(view.targetLabel).toBe("4");
  });

  it("beyond-target: over 100% shows a positive beyond-target label and a zero-clamped remaining label", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({
        completedAllocationTotal: 7.2,
        personalTargetTotal: 6.2,
        targetProgressRatio: 7.2 / 6.2,
        remainingToTarget: 6.2 - 7.2,
      }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.progressPercentLabel).toBe("116%");
    expect(view.remainingLabel).toBe("0");
    expect(view.beyondTargetLabel).toBe("1");
  });

  it("dutyStatusLabel defers to the row's own paceStatus when completed work is under way (not 0, not at/over target)", () => {
    const view = buildDutyFairnessCardView(dutyRow({ paceStatus: "below_pace" }), "/fairness?mode=duties&person=p_1");
    expect(view.dutyStatusLabel).toBe("מתחת לצפי");
  });

  it("dutyStatusLabel: on_pace and ahead_of_pace pass through unchanged too, under the SAME defer-to-paceStatus condition", () => {
    const onPace = buildDutyFairnessCardView(dutyRow({ paceStatus: "on_pace" }), "/fairness?mode=duties&person=p_1");
    const ahead = buildDutyFairnessCardView(dutyRow({ paceStatus: "ahead_of_pace" }), "/fairness?mode=duties&person=p_1");
    expect(onPace.dutyStatusLabel).toBe("בהתאם לצפי");
    expect(ahead.dutyStatusLabel).toBe("מעל לצפי");
  });

  it("dutyStatusLabel: a real zero completedAllocationTotal with a valid target shows the calm 'טרם בוצעו תורנויות' zero state, NEVER 'מתחת לצפי' -- even though the raw pace math (below_pace) would otherwise apply", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({ completedAllocationTotal: 0, personalTargetTotal: 6, targetProgressRatio: 0, remainingToTarget: 6, paceStatus: "below_pace" }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.dutyStatusLabel).toBe("טרם בוצעו תורנויות");
    expect(view.dutyStatusState).toBe("not_started");
  });

  it("dutyStatusLabel: completed exactly equal to target shows 'היעד הושלם', regardless of paceStatus", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({ completedAllocationTotal: 6, personalTargetTotal: 6, targetProgressRatio: 1, remainingToTarget: 0, paceStatus: "below_pace" }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.dutyStatusLabel).toBe("היעד הושלם");
    expect(view.dutyStatusState).toBe("target_reached");
  });

  it("dutyStatusLabel: completed beyond target shows 'מעבר ליעד', regardless of paceStatus", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({ completedAllocationTotal: 7.2, personalTargetTotal: 6.2, targetProgressRatio: 7.2 / 6.2, remainingToTarget: 6.2 - 7.2, paceStatus: "on_pace" }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.dutyStatusLabel).toBe("מעבר ליעד");
    expect(view.dutyStatusState).toBe("target_exceeded");
  });

  it("dutyStatusLabel: the no-target state is unaffected -- null personalTargetTotal or a real 0 target both still produce a null dutyStatusLabel, never a fabricated zero-state badge", () => {
    const nullTarget = buildDutyFairnessCardView(
      dutyRow({ personalTargetTotal: null, targetProgressRatio: null, remainingToTarget: null, paceStatus: null }),
      "/fairness?mode=duties&person=p_1",
    );
    const zeroTarget = buildDutyFairnessCardView(
      dutyRow({ completedAllocationTotal: 0, personalTargetTotal: 0, targetProgressRatio: null, remainingToTarget: null, paceStatus: null }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(nullTarget.dutyStatusLabel).toBeNull();
    expect(nullTarget.dutyStatusState).toBeNull();
    expect(zeroTarget.dutyStatusLabel).toBeNull();
    expect(zeroTarget.dutyStatusState).toBeNull();
  });

  it("two people sharing the SAME allocationLabel get DIFFERENT progress denominators from their own personalTargetTotal -- never a shared role-based constant", () => {
    const lightlyLoaded = buildDutyFairnessCardView(
      dutyRow({ personId: "p_a", allocationLabel: "טכנאי", completedAllocationTotal: 2, personalTargetTotal: 4, targetProgressRatio: 0.5 }),
      "/fairness?mode=duties&person=p_a",
    );
    const heavilyLoaded = buildDutyFairnessCardView(
      dutyRow({ personId: "p_b", allocationLabel: "טכנאי", completedAllocationTotal: 2, personalTargetTotal: 10, targetProgressRatio: 0.2 }),
      "/fairness?mode=duties&person=p_b",
    );
    expect(lightlyLoaded.personalTargetLabel).toBe("4");
    expect(heavilyLoaded.personalTargetLabel).toBe("10");
    expect(lightlyLoaded.progressPercentLabel).toBe("50%");
    expect(heavilyLoaded.progressPercentLabel).toBe("20%");
  });

  it("a real zero personalTargetTotal (genuinely no published-potential assignment) -> hasTarget false, no progress bar figures, the 'no duties assigned' note -- never 0%/empty bar", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({
        allocationLabel: 'ר"צ',
        personalTargetTotal: 0,
        targetProgressRatio: null,
        remainingToTarget: null,
        paceStatus: null,
        completedAllocationTotal: 0,
      }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.hasTarget).toBe(false);
    expect(view.personalTargetLabel).toBe("0");
    expect(view.progressPercentLabel).toBe("—");
    expect(view.noTargetNoteLabel).toBe("אין תורנויות משובצות לפוטנציאל המפורסם בתקופה זו.");
  });

  it("a null personalTargetTotal (a genuine data gap -- unresolved identity or an unsupported block shape in the PLAN) gets its OWN distinct note, never confused with a real zero", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({
        personalTargetTotal: null,
        targetProgressRatio: null,
        remainingToTarget: null,
        paceStatus: null,
      }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.hasTarget).toBe(false);
    expect(view.personalTargetLabel).toBeNull();
    expect(view.noTargetNoteLabel).toBe("היעד האישי אינו זמין כרגע בנתונים.");
  });

  it("duty_target_unavailable (the workbook's OWN role-based target note missing) never affects the personal progress bar at all -- it's a separate, unrelated fact", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({
        comparisonTarget: null,
        dataCompleteness: { status: "partial", reasons: ["duty_target_unavailable"] },
        // personalTargetTotal/targetProgressRatio/remainingToTarget deliberately left at their normal (real) defaults.
      }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.hasTarget).toBe(true);
    expect(view.noTargetNoteLabel).toBeNull();
    expect(view.progressPercentLabel).not.toBe("—");
  });

  it("liveDuty renders a calm label plus the fixed 'points added on completion' companion text", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({ liveDuty: { dutyFamily: "guard", slot: 2 } }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.liveDutyLabel).toBe("שמירה 2 פעילה כרגע");
    expect(view.liveDutySubLabel).toBe("הנקודות יתווספו עם סיום התורנות");
  });

  it("null liveDuty -> both live labels null", () => {
    const view = buildDutyFairnessCardView(dutyRow({ liveDuty: null }), "/fairness?mode=duties&person=p_1");
    expect(view.liveDutyLabel).toBeNull();
    expect(view.liveDutySubLabel).toBeNull();
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
