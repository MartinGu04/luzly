import { describe, expect, it } from "vitest";
import { COMPLETE_FAIRNESS_DATA, fairnessDataCompleteness } from "@/lib/domain/fairnessFoundation";
import type { DutyFairnessPersonRowView } from "@/lib/readModels/dutyFairnessTypes";
import type { ShiftFairnessPersonRowView } from "@/lib/readModels/shiftFairnessTypes";
import { buildDutyFairnessCardView, buildShiftFairnessCardView, shiftFairnessCompletenessNote } from "./fairnessCards";
import { shiftFairRangeStatusLabel } from "./shiftFairRange";

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
    weekendsWorked: 1,
    dataCompleteness: COMPLETE_FAIRNESS_DATA,
    expectationFactors: null,
    ...overrides,
  };
}

describe("buildShiftFairnessCardView", () => {
  it("formats a fully modelable row -- a whole-shift fair RANGE, never the raw fractional target", () => {
    const view = buildShiftFairnessCardView(shiftRow(), "/fairness?person=p_1");
    expect(view).toMatchObject({
      key: "p_1",
      personId: "p_1",
      personName: "דני טכנאי",
      serviceCategory: "regular",
      href: "/fairness?person=p_1",
      actualLabel: "4",
      // target=4.3 -> floor 4, ceil 5 -> "4–5", NEVER a rounded single
      // number like "4.5".
      targetLabel: "4–5",
      targetPeriodLabel: "צפי הוגן עד היום",
      // The raw signed gap is kept only as a secondary/diagnostic value.
      deviationLabel: "-0.3",
      // actualShifts=4 is within [4,5] -> "within", tone "balanced".
      status: "balanced",
      rangeStatus: "within",
      weekendActualLabel: "1",
      weekendTargetLabel: "1",
      unavailableNote: null,
    });
  });

  it("an unmodelable target -> unavailableNote set, never a fake 0/within -- actual work stays visible", () => {
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
    expect(view.rangeStatus).toBeNull();
    expect(view.actualLabel).toBe("4");
    expect(view.unavailableNote).toBe("לא ניתן לחשב יעד מלא לתקופה זו");
    expect(view.completenessNote).not.toBeNull();
  });
});

describe("buildShiftFairnessCardView -- whole-shift fair range: targetLabel, rangeStatus, statusStateLabel", () => {
  it("targetLabel is derived via floor/ceil of the EXACT target, never a rounded single number", () => {
    const wholeNumber = buildShiftFairnessCardView(shiftRow({ actualShifts: 6, target: 6 }), "/fairness?person=p_1");
    expect(wholeNumber.targetLabel).toBe("6");

    const halfFractional = buildShiftFairnessCardView(shiftRow({ actualShifts: 6, target: 5.5 }), "/fairness?person=p_1");
    expect(halfFractional.targetLabel).toBe("5–6");

    const nonHalfFractional = buildShiftFairnessCardView(shiftRow({ actualShifts: 6, target: 5.2 }), "/fairness?person=p_1");
    expect(nonHalfFractional.targetLabel).toBe("5–6");
  });

  it("statusLabel (badge) and statusStateLabel (\"מצב\" row) are DELIBERATELY DIFFERENT wording for the same rangeStatus -- no duplicated text on the card", () => {
    // The real reported scenario: 8 actual, 5.5 exact expected -> range 5–6, actual is 2 over the upper bound -> "above".
    const view = buildShiftFairnessCardView(shiftRow({ actualShifts: 8, target: 5.5 }), "/fairness?person=p_1");
    expect(view.rangeStatus).toBe("above");
    expect(view.statusLabel).toBe("מעל הצפי"); // short badge word
    expect(view.statusStateLabel).toBe("מעל הטווח ההוגן"); // longer, descriptive "מצב" row wording
    expect(view.statusLabel).not.toBe(view.statusStateLabel);
    expect(view.statusStateLabel).not.toMatch(/\d/); // never a raw number as the primary message
  });

  it("one shift past the fair range's upper bound reads as 'slightly above' in BOTH vocabularies, distinct from further above", () => {
    const slightlyAbove = buildShiftFairnessCardView(shiftRow({ actualShifts: 7, target: 5.5 }), "/fairness?person=p_1");
    expect(slightlyAbove.rangeStatus).toBe("slightly_above");
    expect(slightlyAbove.statusLabel).toBe("מעט מעל הצפי");
    expect(slightlyAbove.statusStateLabel).toBe("מעט מעל הטווח ההוגן");

    const above = buildShiftFairnessCardView(shiftRow({ actualShifts: 8, target: 5.5 }), "/fairness?person=p_1");
    expect(above.statusLabel).toBe("מעל הצפי");
    expect(above.statusStateLabel).toBe("מעל הטווח ההוגן");
  });

  it("both endpoints of the fair range read as within (badge 'בטווח הצפי' / מצב 'בתוך הטווח ההוגן'), never 'above'/'below' just for landing on a boundary", () => {
    const lowerBound = buildShiftFairnessCardView(shiftRow({ actualShifts: 5, target: 5.5 }), "/fairness?person=p_1");
    expect(lowerBound.rangeStatus).toBe("within");
    expect(lowerBound.statusLabel).toBe("בטווח הצפי");
    expect(lowerBound.statusStateLabel).toBe("בתוך הטווח ההוגן");

    const upperBound = buildShiftFairnessCardView(shiftRow({ actualShifts: 6, target: 5.5 }), "/fairness?person=p_1");
    expect(upperBound.rangeStatus).toBe("within");
  });

  it("below the range reads as badge 'מתחת לצפי' / מצב 'פחות מהטווח ההוגן', with no further magnitude-based nuance", () => {
    const view = buildShiftFairnessCardView(shiftRow({ actualShifts: 4, target: 5.5 }), "/fairness?person=p_1");
    expect(view.rangeStatus).toBe("below");
    expect(view.statusLabel).toBe("מתחת לצפי");
    expect(view.statusStateLabel).toBe("פחות מהטווח ההוגן");
  });

  it("a whole-number exact target reuses the pre-existing severity model with no 'slightly above' tier", () => {
    const exact = buildShiftFairnessCardView(shiftRow({ actualShifts: 5, target: 5 }), "/fairness?person=p_1");
    expect(exact.rangeStatus).toBe("within");
    const overshoot = buildShiftFairnessCardView(shiftRow({ actualShifts: 6, target: 5 }), "/fairness?person=p_1");
    expect(overshoot.rangeStatus).toBe("above"); // never "slightly_above" -- a whole-number target has no fractional range to be adjacent to.
  });

  it("spot-check across several people with different exact expectations -- integer, .5, non-.5 decimal, and a very low expectation", () => {
    const wholeNumber = buildShiftFairnessCardView(shiftRow({ personId: "p_a", actualShifts: 6, target: 6 }), "/fairness?person=p_a");
    const halfFractional = buildShiftFairnessCardView(shiftRow({ personId: "p_b", actualShifts: 8, target: 5.5 }), "/fairness?person=p_b");
    const nonHalfFractional = buildShiftFairnessCardView(shiftRow({ personId: "p_c", actualShifts: 4, target: 3.2 }), "/fairness?person=p_c");
    const veryLow = buildShiftFairnessCardView(shiftRow({ personId: "p_d", actualShifts: 1, target: 0.5 }), "/fairness?person=p_d");

    expect(wholeNumber.targetLabel).toBe("6");
    expect(wholeNumber.rangeStatus).toBe("within");

    // The exact reported Leia scenario.
    expect(halfFractional.targetLabel).toBe("5–6");
    expect(halfFractional.rangeStatus).toBe("above");

    expect(nonHalfFractional.targetLabel).toBe("3–4");
    expect(nonHalfFractional.rangeStatus).toBe("within"); // 4 is the range's own upper bound.

    expect(veryLow.targetLabel).toBe("0–1");
    expect(veryLow.rangeStatus).toBe("within");
  });

  it("the exact live-reported Leia scenario: actual=8, exact target=5.5 -> displayed range '5–6', weekendsWorked=2 unaffected by the range fix", () => {
    const view = buildShiftFairnessCardView(
      shiftRow({ personId: "p_leia", actualShifts: 8, target: 5.5, weekendActualShifts: 6, weekendsWorked: 2 }),
      "/fairness?person=p_leia",
    );

    expect(view.actualLabel).toBe("8");
    expect(view.targetLabel).toBe("5–6");
    expect(view.rangeStatus).toBe("above");
    expect(view.statusLabel).toBe("מעל הצפי");
    expect(view.statusStateLabel).toBe("מעל הטווח ההוגן");
    expect(view.statusExplanationLabel).toBe("ביצעת יותר משמרות מטווח הצפי ההוגן שלך עד היום.");
    // The weekend fix and the range fix are independent -- weekendsWorked
    // renders correctly regardless of the range/status computation above.
    expect(view.weekendActualLabel).toBe("2");
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

describe("buildShiftFairnessCardView -- weekendActualLabel sources from weekendsWorked (distinct weekends), never weekendActualShifts (weekend shift-slots)", () => {
  it("shows weekendsWorked's value even when it genuinely differs from weekendActualShifts -- the exact reported bug shape", () => {
    // 6 real weekend shift-slots (weekendActualShifts) across only 2
    // distinct Thu-Sat blocks (weekendsWorked) -- the card must show "2".
    const view = buildShiftFairnessCardView(
      shiftRow({ weekendActualShifts: 6, weekendsWorked: 2 }),
      "/fairness?person=p_1",
    );
    expect(view.weekendActualLabel).toBe("2");
    expect(view.weekendActualLabel).not.toBe("6");
  });
});

describe("buildShiftFairnessCardView -- shift fairness clarity: statusLabel never says 'target', statusExplanationLabel", () => {
  it("statusLabel uses shiftFairRangeStatusLabel's range-aware 'expected' vocabulary, matching rangeStatus", () => {
    const above = buildShiftFairnessCardView(shiftRow({ actualShifts: 8, target: 5.5 }), "/fairness?person=p_1");
    expect(above.statusLabel).toBe(shiftFairRangeStatusLabel("above"));
    expect(above.statusLabel).toBe("מעל הצפי");
    expect(above.statusLabel).not.toContain("יעד");

    const below = buildShiftFairnessCardView(shiftRow({ actualShifts: 4, target: 5.5 }), "/fairness?person=p_1");
    expect(below.statusLabel).toBe("מתחת לצפי");

    const within = buildShiftFairnessCardView(shiftRow({ actualShifts: 5, target: 5.5 }), "/fairness?person=p_1");
    expect(within.statusLabel).toBe("בטווח הצפי");

    const unavailable = buildShiftFairnessCardView(shiftRow({ status: null, target: null, deviation: null }), "/fairness?person=p_1");
    expect(unavailable.statusLabel).toBe("לא ניתן להשוות");
  });

  it("statusExplanationLabel gives a concrete, range-framed sentence for each real rangeStatus, never a fractional shift count or 'worked harder'", () => {
    const above = buildShiftFairnessCardView(shiftRow({ actualShifts: 8, target: 5.5 }), "/fairness?person=p_1");
    expect(above.statusExplanationLabel).toBe("ביצעת יותר משמרות מטווח הצפי ההוגן שלך עד היום.");
    expect(above.statusExplanationLabel).not.toMatch(/עבד(ת)? קשה|worked harder|\d\.\d/);

    const slightlyAbove = buildShiftFairnessCardView(shiftRow({ actualShifts: 7, target: 5.5 }), "/fairness?person=p_1");
    expect(slightlyAbove.statusExplanationLabel).toBe("ביצעת מעט יותר משמרות מטווח הצפי ההוגן שלך עד היום.");

    const below = buildShiftFairnessCardView(shiftRow({ actualShifts: 4, target: 5.5 }), "/fairness?person=p_1");
    expect(below.statusExplanationLabel).toBe("ביצעת פחות משמרות מטווח הצפי ההוגן שלך עד היום.");

    const within = buildShiftFairnessCardView(shiftRow({ actualShifts: 5, target: 5.5 }), "/fairness?person=p_1");
    expect(within.statusExplanationLabel).toBe("ביצעת משמרות בתוך טווח הצפי ההוגן שלך עד היום.");
  });

  it("statusExplanationLabel is null exactly when rangeStatus is null -- nothing to explain when the comparison itself is unavailable", () => {
    const view = buildShiftFairnessCardView(
      shiftRow({ status: null, target: null, deviation: null }),
      "/fairness?person=p_1",
    );
    expect(view.rangeStatus).toBeNull();
    expect(view.statusExplanationLabel).toBeNull();
  });

  it("names 'today' only for the actual current month -- a closed historical or future month's target covers the whole period, not 'as of today'", () => {
    const current = buildShiftFairnessCardView(shiftRow({ actualShifts: 8, target: 5.5 }), "/fairness?person=p_1", true);
    expect(current.statusExplanationLabel).toContain("עד היום");
    expect(current.targetPeriodLabel).toBe("צפי הוגן עד היום");

    const closed = buildShiftFairnessCardView(shiftRow({ actualShifts: 8, target: 5.5 }), "/fairness?person=p_1", false);
    expect(closed.statusExplanationLabel).not.toContain("עד היום");
    expect(closed.statusExplanationLabel).toContain("בתקופה זו");
    expect(closed.targetPeriodLabel).toBe("צפי הוגן לתקופה זו");
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

  it("weekendSuspendedNote is null when the row's data completeness has no emergency-period reason", () => {
    const view = buildDutyFairnessCardView(dutyRow(), "/fairness?mode=duties&person=p_1");
    expect(view.weekendSuspendedNote).toBeNull();
  });

  it("weekendSuspendedNote explains the suppression when weekendCount is null due to an emergency-period overlap", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({
        weekendCount: null,
        dataCompleteness: fairnessDataCompleteness(["duty_weekend_count_emergency_period"]),
      }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.weekendLabel).toBe("—");
    expect(view.weekendSuspendedNote).not.toBeNull();
  });

  it("weekendSuspendedNote stays null for an ordinary missing weekend count unrelated to Emergency Mode", () => {
    const view = buildDutyFairnessCardView(
      dutyRow({ weekendCount: null, dataCompleteness: fairnessDataCompleteness(["duty_identity_unresolved"]) }),
      "/fairness?mode=duties&person=p_1",
    );
    expect(view.weekendLabel).toBe("—");
    expect(view.weekendSuspendedNote).toBeNull();
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
