import { describe, expect, it } from "vitest";
import type { AbsenceKind } from "@/lib/domain/event";
import type { IssueReason } from "@/lib/domain/operationalIssues";
import { absenceKindLabel, issueReasonLabel, managerIssueReasonLabel, requiredCapabilityLabel } from "./labels";

const REASONS: IssueReason[] = [
  "blocking_absence_with_assignment",
  "shift_coverage_missing",
  "shift_coverage_partial",
  "invalid_shift_time",
  "role_capability_mismatch",
];

describe("managerIssueReasonLabel", () => {
  it("every reason maps to distinct, non-empty copy", () => {
    const labels = REASONS.map(managerIssueReasonLabel);
    expect(new Set(labels).size).toBe(REASONS.length);
    for (const label of labels) expect(label).not.toBe("");
  });

  it("never uses the personal second-person 'שלך' phrasing", () => {
    for (const reason of REASONS) {
      expect(managerIssueReasonLabel(reason)).not.toContain("שלך");
    }
  });

  it("drops the personal 'שלך' wording wherever issueReasonLabel used it", () => {
    for (const reason of REASONS) {
      if (issueReasonLabel(reason).includes("שלך")) {
        expect(managerIssueReasonLabel(reason)).not.toBe(issueReasonLabel(reason));
      }
    }
  });
});

describe("requiredCapabilityLabel", () => {
  it("isSupervisor -> אחמ\"ש", () => {
    expect(requiredCapabilityLabel("isSupervisor")).toBe('אחמ"ש');
  });

  it("isTechnician -> טכנאי", () => {
    expect(requiredCapabilityLabel("isTechnician")).toBe("טכנאי");
  });
});

describe("absenceKindLabel", () => {
  const kinds: AbsenceKind[] = ["vacation", "abroad", "medical", "day_off", "after", "referral"];

  it("every AbsenceKind maps to distinct, non-empty copy", () => {
    const labels = kinds.map(absenceKindLabel);
    expect(new Set(labels).size).toBe(kinds.length);
    for (const label of labels) expect(label).not.toBe("");
  });

  it("matches the exact phrase event.ts classifies from", () => {
    expect(absenceKindLabel("vacation")).toBe("חופש");
    expect(absenceKindLabel("abroad")).toBe('חו"ל');
    expect(absenceKindLabel("medical")).toBe("גימלים");
    expect(absenceKindLabel("referral")).toBe("הפנייה");
  });
});
