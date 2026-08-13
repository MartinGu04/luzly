import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerAttentionSection } from "./ManagerAttentionSection";
import type { ManagerIssueRowView, ManagerPotentialRowView } from "./types";

afterEach(() => {
  cleanup();
});

function issueView(overrides: Partial<ManagerIssueRowView> = {}): ManagerIssueRowView {
  return {
    key: "k1",
    personName: "מרטין בדיקה",
    severity: "critical",
    reasonLabel: "חסר כיסוי למשמרת",
    dateLabel: "היום",
    targetEmoji: null,
    targetTitle: null,
    missingIntervalLabels: null,
    explanation: null,
    guidance: "בדוק מי אמור להשלים את הכיסוי למשמרת.",
    ...overrides,
  };
}

function potentialView(overrides: Partial<ManagerPotentialRowView> = {}): ManagerPotentialRowView {
  return {
    key: "p1",
    dateLabel: "היום",
    columnLabel: "כונן פינויים",
    sourceRawValue: "מרטין בדיקה",
    resolvedPersonName: "מרטין בדיקה",
    status: "missing",
    namedPersonBlockingAbsence: true,
    ...overrides,
  };
}

describe("ManagerAttentionSection", () => {
  it("shows the calm success state when everything is empty", () => {
    render(<ManagerAttentionSection criticalIssues={[]} reviewIssues={[]} potentialProblems={[]} />);
    expect(screen.getByText("אין כרגע דברים שדורשים התייחסות בטווח שנבחר")).toBeInTheDocument();
  });

  it("shows critical issues under the דחוף heading", () => {
    render(<ManagerAttentionSection criticalIssues={[issueView()]} reviewIssues={[]} potentialProblems={[]} />);
    expect(screen.getByText("דחוף")).toBeInTheDocument();
    expect(screen.getByText(/מרטין בדיקה/)).toBeInTheDocument();
  });

  it("shows review issues under the לבדיקה heading", () => {
    render(
      <ManagerAttentionSection
        criticalIssues={[]}
        reviewIssues={[issueView({ severity: "review", key: "k2" })]}
        potentialProblems={[]}
      />,
    );
    expect(screen.getByText("לבדיקה")).toBeInTheDocument();
  });

  it("shows potential problems under their own heading", () => {
    render(<ManagerAttentionSection criticalIssues={[]} reviewIssues={[]} potentialProblems={[potentialView()]} />);
    expect(screen.getByText(/דרישות Potential שדורשות בדיקה/)).toBeInTheDocument();
  });

  it("renders both critical and review sections together without hiding either", () => {
    render(
      <ManagerAttentionSection
        criticalIssues={[issueView()]}
        reviewIssues={[issueView({ severity: "review", key: "k2" })]}
        potentialProblems={[]}
      />,
    );
    expect(screen.getByText("דחוף")).toBeInTheDocument();
    expect(screen.getByText("לבדיקה")).toBeInTheDocument();
  });
});
