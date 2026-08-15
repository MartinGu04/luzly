import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalIssue } from "@/lib/readModels/types";
import { IssuesPanel } from "./IssuesPanel";

afterEach(() => {
  cleanup();
});

function issue(overrides: Partial<PersonalIssue> = {}): PersonalIssue {
  return {
    reason: "shift_coverage_missing",
    severity: "critical",
    date: "2026-08-12",
    missingIntervals: null,
    metadata: null,
    targetEvent: null,
    ...overrides,
  };
}

describe("IssuesPanel", () => {
  it("28. renders a quiet success status when there are no issues", () => {
    render(<IssuesPanel issues={[]} />);
    expect(screen.getByText("הסידור שלך נראה תקין")).toBeInTheDocument();
  });

  it("does not render a giant permanent issues area when there is nothing wrong", () => {
    render(<IssuesPanel issues={[]} />);
    expect(screen.queryByText("לתשומת לבך")).toBeNull();
  });

  it("26. issues map to friendly Hebrew copy", () => {
    render(<IssuesPanel issues={[issue({ reason: "shift_coverage_missing" })]} />);
    expect(screen.getByText("חסר כיסוי למשמרת שלך")).toBeInTheDocument();
  });

  it("26. every machine reason maps to distinct friendly copy", () => {
    const reasons: PersonalIssue["reason"][] = [
      "blocking_absence_with_assignment",
      "shift_coverage_missing",
      "shift_coverage_partial",
      "invalid_shift_time",
      "role_capability_mismatch",
    ];
    const { container } = render(<IssuesPanel issues={reasons.map((reason) => issue({ reason }))} />);
    expect(screen.getByText("קיימת חפיפה בין היעדרות לשיבוץ שלך")).toBeInTheDocument();
    expect(screen.getByText("חסר כיסוי למשמרת שלך")).toBeInTheDocument();
    expect(screen.getByText("הכיסוי למשמרת שלך חלקי")).toBeInTheDocument();
    expect(screen.getByText("שעות המשמרת דורשות בדיקה")).toBeInTheDocument();
    expect(screen.getByText("השיבוץ שלך דורש בדיקת תפקיד")).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(5);
  });

  it("names the missing role for a coverage issue on a known shift, instead of the generic wording", () => {
    render(
      <IssuesPanel
        issues={[
          issue({
            reason: "shift_coverage_missing",
            targetEvent: { date: "2026-08-12", category: "shift", title: "טכנאי יום", role: "technician", period: "day" },
          }),
        ]}
      />,
    );
    expect(screen.getByText('חסר אחמ"ש למשמרת שלך')).toBeInTheDocument();
    expect(screen.queryByText("חסר כיסוי למשמרת שלך")).toBeNull();
  });

  it("27. never renders a raw IssueReason machine value", () => {
    render(<IssuesPanel issues={[issue({ reason: "shift_coverage_missing" })]} />);
    expect(screen.queryByText(/shift_coverage_missing/)).toBeNull();
  });

  it("a critical issue's icon pulses, never the whole panel", () => {
    const { container } = render(<IssuesPanel issues={[issue({ severity: "critical" })]} />);
    const pulsing = container.querySelectorAll(".animate-issue-pulse");
    expect(pulsing.length).toBe(1);
    const panel = container.querySelector("li");
    expect(panel?.className).not.toContain("animate-issue-pulse");
  });

  it("a review-severity issue does not pulse", () => {
    const { container } = render(<IssuesPanel issues={[issue({ severity: "review" })]} />);
    expect(container.querySelector(".animate-issue-pulse")).toBeNull();
  });
});
