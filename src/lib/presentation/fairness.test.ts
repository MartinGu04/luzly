import { describe, expect, it } from "vitest";
import {
  exemptionBadgeLabel,
  formatDutyPaceLabel,
  formatFairnessDelta,
  formatFairnessDeviationState,
  formatFairnessExpectedValue,
  formatFairnessGap,
  formatFairnessScore,
  formatFairnessWeekendCount,
  formatNormalizedLoad,
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

describe("formatDutyPaceLabel", () => {
  it("maps each real pace status to its own restrained Hebrew phrase", () => {
    expect(formatDutyPaceLabel("below_pace")).toBe("מתחת לקצב");
    expect(formatDutyPaceLabel("on_pace")).toBe("בקצב הצפוי");
    expect(formatDutyPaceLabel("ahead_of_pace")).toBe("לפני הקצב");
  });

  it("null -> null, never a fabricated badge", () => {
    expect(formatDutyPaceLabel(null)).toBeNull();
  });
});
