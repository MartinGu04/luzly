import { describe, expect, it } from "vitest";
import {
  exemptionBadgeLabel,
  formatDutyStatusLabel,
  formatFairnessDelta,
  formatFairnessDeviationState,
  formatFairnessExpectedValue,
  formatFairnessGap,
  formatFairnessScore,
  formatFairnessWeekendCount,
  formatNormalizedLoad,
  resolveDutyStatusState,
  roundToNearestHalf,
} from "./fairness";

describe("formatFairnessScore", () => {
  it("trims trailing zeros but keeps meaningful decimals", () => {
    expect(formatFairnessScore(6.35)).toBe("6.35");
    expect(formatFairnessScore(5)).toBe("5");
    expect(formatFairnessScore(7.1)).toBe("7.1");
  });

  it("null -> em dash, never 0", () => {
    expect(formatFairnessScore(null)).toBe("—");
  });
});

describe("formatFairnessWeekendCount", () => {
  it("shows 0 as 0, distinct from null", () => {
    expect(formatFairnessWeekendCount(0)).toBe("0");
    expect(formatFairnessWeekendCount(null)).toBe("—");
  });
});

describe("formatFairnessGap", () => {
  it("shows a negative gap plainly", () => {
    expect(formatFairnessGap(-1.7)).toBe("-1.7");
  });

  it("shows a positive gap with a plus sign", () => {
    expect(formatFairnessGap(1.5)).toBe("+1.5");
  });

  it("null -> em dash", () => {
    expect(formatFairnessGap(null)).toBe("—");
  });
});

describe("formatFairnessDelta — PR #15 §11", () => {
  it("formats a positive delta padded to 2 decimals with a plus sign", () => {
    expect(formatFairnessDelta(1.4)).toBe("+1.40");
  });

  it("formats a negative delta padded to 2 decimals", () => {
    expect(formatFairnessDelta(-0.2)).toBe("-0.20");
  });

  it("zero delta shows bare 0", () => {
    expect(formatFairnessDelta(0)).toBe("0");
  });

  it("null previous score -> honest 'new' phrasing, never treated as a delta from 0", () => {
    expect(formatFairnessDelta(null)).toBe("חדש · אין ניקוד קודם");
  });
});

describe("formatNormalizedLoad", () => {
  it("formats as a rounded percentage", () => {
    expect(formatNormalizedLoad(0.75)).toBe("75%");
  });

  it("null -> em dash", () => {
    expect(formatNormalizedLoad(null)).toBe("—");
  });
});

describe("exemptionBadgeLabel", () => {
  it("prefixes the raw label with the exemption icon", () => {
    expect(exemptionBadgeLabel({ raw: "שמירות", affectedDutyFamilies: ["guard"] })).toBe("🚫 שמירות");
  });
});

describe("roundToNearestHalf", () => {
  it("rounds up past the midpoint", () => {
    expect(roundToNearestHalf(6.35)).toBe(6.5);
  });

  it("rounds down below the midpoint", () => {
    expect(roundToNearestHalf(6.2)).toBe(6);
  });

  it("leaves an exact half or whole number untouched", () => {
    expect(roundToNearestHalf(6.5)).toBe(6.5);
    expect(roundToNearestHalf(6)).toBe(6);
  });
});

describe("formatFairnessExpectedValue — Justice Table redesign: display-only rounding to the nearest 0.5", () => {
  it("rounds for display without altering the underlying value", () => {
    expect(formatFairnessExpectedValue(6.35)).toBe("6.5");
    expect(formatFairnessExpectedValue(6.2)).toBe("6");
    expect(formatFairnessExpectedValue(6)).toBe("6");
  });

  it("null -> em dash, never a fabricated 0", () => {
    expect(formatFairnessExpectedValue(null)).toBe("—");
  });
});

describe("formatFairnessDeviationState — Justice Table redesign: human-readable state, never a raw signed gap", () => {
  it("balanced reads as 'on expected level', with no magnitude shown", () => {
    expect(formatFairnessDeviationState(0.3, "balanced")).toBe("בהתאם לצפוי");
  });

  it("below shows the rounded magnitude with a 'below expected' phrase", () => {
    expect(formatFairnessDeviationState(-1.2, "below")).toBe("1 מתחת לצפוי");
  });

  it("above shows the rounded magnitude with an 'above expected' phrase", () => {
    expect(formatFairnessDeviationState(0.9, "above")).toBe("1 מעל הצפוי");
  });

  it("a fractional magnitude that rounds to a half-shift still displays as .5", () => {
    expect(formatFairnessDeviationState(-0.7, "below")).toBe("0.5 מתחת לצפוי");
  });

  it("null status or deviation -> the generic unavailable phrase, never a guessed direction", () => {
    expect(formatFairnessDeviationState(null, null)).toBe("לא ניתן להשוות");
    expect(formatFairnessDeviationState(1, null)).toBe("לא ניתן להשוות");
  });
});

describe("formatDutyStatusLabel", () => {
  it("maps each state to its own restrained Hebrew phrase, per the Justice Table pace/status-language refinement", () => {
    expect(formatDutyStatusLabel("not_started")).toBe("טרם בוצעו תורנויות");
    expect(formatDutyStatusLabel("below_pace")).toBe("מתחת לצפי");
    expect(formatDutyStatusLabel("on_pace")).toBe("בהתאם לצפי");
    expect(formatDutyStatusLabel("ahead_of_pace")).toBe("מעל לצפי");
    expect(formatDutyStatusLabel("target_reached")).toBe("היעד הושלם");
    expect(formatDutyStatusLabel("target_exceeded")).toBe("מעבר ליעד");
  });

  it("'suspended' (Emergency Mode currently active, spec section 19) gets its own calm factual phrase, distinct from below_pace", () => {
    expect(formatDutyStatusLabel("suspended")).toBe("מושהה בזמן מצב חירום");
  });

  it("null -> null, never a fabricated badge", () => {
    expect(formatDutyStatusLabel(null)).toBeNull();
  });

  it("never produces the old pace-only wording it replaces", () => {
    const allLabels = (
      ["not_started", "below_pace", "on_pace", "ahead_of_pace", "suspended", "target_reached", "target_exceeded"] as const
    ).map((status) => formatDutyStatusLabel(status));
    expect(allLabels).not.toContain("בקצב הצפוי");
    expect(allLabels).not.toContain("מתחת לקצב");
    expect(allLabels).not.toContain("לפני הקצב");
  });
});

describe("resolveDutyStatusState — precedence, per the Justice Table pace/status-language refinement", () => {
  it("no valid target (null, or <= 0) -> null, preserving the existing no-target state", () => {
    expect(resolveDutyStatusState(2, null, "below_pace")).toBeNull();
    expect(resolveDutyStatusState(2, 0, "below_pace")).toBeNull();
    expect(resolveDutyStatusState(0, -1, null)).toBeNull();
  });

  it("completed work unavailable -> null, even with a valid target", () => {
    expect(resolveDutyStatusState(null, 6, "below_pace")).toBeNull();
  });

  it("completed > target -> target_exceeded, regardless of paceStatus", () => {
    expect(resolveDutyStatusState(7, 6, "below_pace")).toBe("target_exceeded");
    expect(resolveDutyStatusState(7, 6, null)).toBe("target_exceeded");
  });

  it("completed === target -> target_reached, regardless of paceStatus", () => {
    expect(resolveDutyStatusState(6, 6, "below_pace")).toBe("target_reached");
    expect(resolveDutyStatusState(6, 6, "ahead_of_pace")).toBe("target_reached");
  });

  it("a completed total a few floating-point ULPs from the target is still treated as reached, never falling through to a stale pace label", () => {
    // 0.2 summed 30 times drifts to 5.999999999999998 in real JS floating math.
    const almostSix = Array.from({ length: 30 }, () => 0.2).reduce((sum, weight) => sum + weight, 0);
    expect(almostSix).not.toBe(6); // demonstrates the real drift this guards against
    expect(resolveDutyStatusState(almostSix, 6, "below_pace")).toBe("target_reached");
  });

  it("completed === 0 (with a valid target, under target) -> not_started, NEVER below_pace even though the raw pace math would say below", () => {
    expect(resolveDutyStatusState(0, 6, "below_pace")).toBe("not_started");
  });

  it("completed > 0 and under target -> defers to the existing paceStatus, unchanged", () => {
    expect(resolveDutyStatusState(2, 6, "below_pace")).toBe("below_pace");
    expect(resolveDutyStatusState(3, 6, "on_pace")).toBe("on_pace");
    expect(resolveDutyStatusState(5, 6, "ahead_of_pace")).toBe("ahead_of_pace");
  });

  it("completed > 0, under target, but paceStatus itself unavailable -> null", () => {
    expect(resolveDutyStatusState(2, 6, null)).toBeNull();
  });

  it("completed > 0, under target, paceStatus 'suspended' (Emergency Mode active) -> passes through as 'suspended', never 'below_pace'", () => {
    expect(resolveDutyStatusState(2, 6, "suspended")).toBe("suspended");
  });

  it("target_exceeded/target_reached/not_started still take precedence over 'suspended', same as over any other paceStatus", () => {
    expect(resolveDutyStatusState(7, 6, "suspended")).toBe("target_exceeded");
    expect(resolveDutyStatusState(6, 6, "suspended")).toBe("target_reached");
    expect(resolveDutyStatusState(0, 6, "suspended")).toBe("not_started");
  });
});
