import { describe, expect, it } from "vitest";
import {
  exemptionBadgeLabel,
  formatFairnessDelta,
  formatFairnessGap,
  formatFairnessScore,
  formatFairnessWeekendCount,
  formatNormalizedLoad,
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
