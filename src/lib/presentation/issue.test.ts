import { describe, expect, it } from "vitest";
import type { IssueReason } from "@/lib/domain/operationalIssues";
import type { PersonalIssueTargetSummary } from "@/lib/readModels/types";
import {
  issueDateLabel,
  issueExplanation,
  issueGuidanceLabel,
  issueSummaryLabel,
  issueTargetEmoji,
  issueTargetTitle,
} from "./issue";

function target(overrides: Partial<PersonalIssueTargetSummary> = {}): PersonalIssueTargetSummary {
  return {
    date: "2026-08-13",
    category: "shift",
    title: "טכנאי לילה",
    role: "technician",
    period: "night",
    ...overrides,
  };
}

describe("issueGuidanceLabel", () => {
  const reasons: IssueReason[] = [
    "blocking_absence_with_assignment",
    "shift_coverage_missing",
    "shift_coverage_partial",
    "invalid_shift_time",
    "role_capability_mismatch",
  ];

  it("every current IssueReason maps to friendly, non-empty guidance copy", () => {
    for (const reason of reasons) {
      expect(issueGuidanceLabel(reason)).not.toBe("");
    }
  });

  it("never renders a raw machine reason string", () => {
    for (const reason of reasons) {
      expect(issueGuidanceLabel(reason)).not.toMatch(/_/);
    }
  });

  it("gives distinct copy for shift_coverage_missing vs shift_coverage_partial", () => {
    expect(issueGuidanceLabel("shift_coverage_missing")).not.toBe(issueGuidanceLabel("shift_coverage_partial"));
  });
});

describe("issueExplanation", () => {
  it("blocking_absence_with_assignment: explains without guessing the absence kind", () => {
    const text = issueExplanation({ reason: "blocking_absence_with_assignment", metadata: null });
    expect(text).toContain("היעדרות חוסמת");
    expect(text).not.toMatch(/vacation|abroad|medical|day_off/);
  });

  it("invalid_shift_time: explains without repairing or fabricating a time", () => {
    const text = issueExplanation({ reason: "invalid_shift_time", metadata: null });
    expect(text).toContain("שעות המשמרת");
    expect(text).not.toMatch(/\d{2}:\d{2}/);
  });

  it("role_capability_mismatch with isSupervisor maps to אחמ\"ש, never the internal enum name", () => {
    const text = issueExplanation({
      reason: "role_capability_mismatch",
      metadata: { requiredCapability: "isSupervisor" },
    });
    expect(text).toContain('אחמ"ש');
    expect(text).not.toContain("isSupervisor");
  });

  it("role_capability_mismatch with isTechnician maps to טכנאי, never the internal enum name", () => {
    const text = issueExplanation({
      reason: "role_capability_mismatch",
      metadata: { requiredCapability: "isTechnician" },
    });
    expect(text).toContain("טכנאי");
    expect(text).not.toContain("isTechnician");
  });

  it("role_capability_mismatch never asserts the person is definitively unqualified", () => {
    const text = issueExplanation({
      reason: "role_capability_mismatch",
      metadata: { requiredCapability: "isTechnician" },
    });
    expect(text).not.toMatch(/לא מוסמך|אינך מוסמך/);
  });

  it("returns null for role_capability_mismatch when metadata is missing (never guesses)", () => {
    expect(issueExplanation({ reason: "role_capability_mismatch", metadata: null })).toBeNull();
  });

  it("returns null for coverage reasons -- they speak through missingIntervals instead", () => {
    expect(issueExplanation({ reason: "shift_coverage_missing", metadata: null })).toBeNull();
    expect(issueExplanation({ reason: "shift_coverage_partial", metadata: null })).toBeNull();
  });
});

describe("issueTargetTitle / issueTargetEmoji", () => {
  it("a shift target renders role + period", () => {
    expect(issueTargetTitle(target({ role: "technician", period: "night" }))).toBe("טכנאי לילה");
    expect(issueTargetEmoji(target({ period: "night" }))).toBe("🌙");
  });

  it("a supervisor day shift target", () => {
    expect(issueTargetTitle(target({ role: "supervisor", period: "day" }))).toBe('אחמ"ש יום');
    expect(issueTargetEmoji(target({ period: "day" }))).toBe("☀️");
  });

  it("a duty/other target displays its own sanitized title honestly, never inferred", () => {
    const dutyTarget = target({ category: "duty", title: "שמירה 2", role: null, period: "unspecified" });
    expect(issueTargetTitle(dutyTarget)).toBe("שמירה 2");
    expect(issueTargetEmoji(dutyTarget)).toBeNull();
  });

  it("a shift target with unknown role/period falls back to its own honest title", () => {
    const unknownTarget = target({ role: null, period: "unspecified", title: "משמרת" });
    expect(issueTargetTitle(unknownTarget)).toBe("משמרת");
  });
});

describe("issueDateLabel", () => {
  it("today", () => {
    expect(issueDateLabel("2026-08-13", "2026-08-13")).toBe("היום");
  });

  it("tomorrow", () => {
    expect(issueDateLabel("2026-08-14", "2026-08-13")).toBe("מחר");
  });

  it("another day falls back to the full Hebrew weekday/date form", () => {
    expect(issueDateLabel("2026-08-16", "2026-08-13")).toBe("יום ראשון · 16 באוגוסט");
  });
});

describe("issueSummaryLabel", () => {
  it("returns null when there are no issues", () => {
    expect(issueSummaryLabel([])).toBeNull();
  });

  it("critical only -- null, the group heading already says this", () => {
    expect(issueSummaryLabel([{ severity: "critical" }])).toBeNull();
    expect(issueSummaryLabel([{ severity: "critical" }, { severity: "critical" }])).toBeNull();
  });

  it("review only -- null", () => {
    expect(issueSummaryLabel([{ severity: "review" }])).toBeNull();
    expect(issueSummaryLabel([{ severity: "review" }, { severity: "review" }])).toBeNull();
  });

  it("info only -- null", () => {
    expect(issueSummaryLabel([{ severity: "info" }])).toBeNull();
  });

  it("critical + review combined -- present, in severity order", () => {
    expect(
      issueSummaryLabel([{ severity: "critical" }, { severity: "critical" }, { severity: "review" }]),
    ).toBe("2 דחופים · 1 לבדיקה");
  });

  it("review + info combined -- present, never mentions critical", () => {
    const summary = issueSummaryLabel([{ severity: "review" }, { severity: "info" }]);
    expect(summary).toBe("1 לבדיקה · 1 לתשומת לב");
    expect(summary).not.toContain("דחוף");
  });

  it("all three severities -- present, forward-compatible with info", () => {
    expect(
      issueSummaryLabel([{ severity: "critical" }, { severity: "review" }, { severity: "info" }]),
    ).toBe("1 דחוף · 1 לבדיקה · 1 לתשומת לב");
  });
});
