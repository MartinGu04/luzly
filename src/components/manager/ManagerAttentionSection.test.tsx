import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerAttentionSection } from "./ManagerAttentionSection";
import type { ManagerAttentionItem, ManagerPotentialRowView } from "./types";
import type { IssueRowView } from "@/components/issues/types";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";

const CURRENT: ManagerHrefParams = { personId: null, range: "7d", month: null, category: "overview" };

afterEach(() => {
  cleanup();
});

function issueView(overrides: Partial<IssueRowView> = {}): IssueRowView {
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
    requirementTitle: "כונן פינויים",
    sourceAllocationLabel: "מרטין בדיקה",
    actualAssigneeNames: [],
    status: "missing",
    sourceConflictNote: "מקור ההקצאה (מרטין בדיקה) נמצא/ת בהיעדרות חוסמת באותו יום בסידור הפנימי.",
    ...overrides,
  };
}

function issueItem(overrides: Partial<IssueRowView> = {}): ManagerAttentionItem {
  return { kind: "issue", view: issueView(overrides) };
}

function potentialItem(overrides: Partial<ManagerPotentialRowView> = {}): ManagerAttentionItem {
  return { kind: "potential", view: potentialView(overrides) };
}

describe("ManagerAttentionSection", () => {
  it("shows the calm success state when everything is empty", () => {
    render(<ManagerAttentionSection criticalItems={[]} reviewItems={[]} current={CURRENT} />);
    expect(screen.getByText("אין כרגע דברים שדורשים טיפול בטווח שנבחר")).toBeInTheDocument();
  });

  it("shows the דורש טיפול heading and critical issues under the דחוף heading", () => {
    render(<ManagerAttentionSection criticalItems={[issueItem()]} reviewItems={[]} current={CURRENT} />);
    expect(screen.getByText("דורש טיפול")).toBeInTheDocument();
    expect(screen.getByText("דחוף")).toBeInTheDocument();
    expect(screen.getByText(/מרטין בדיקה/)).toBeInTheDocument();
  });

  it("shows review issues under the לבדיקה heading", () => {
    render(
      <ManagerAttentionSection
        criticalItems={[]}
        reviewItems={[issueItem({ severity: "review", key: "k2" })]}
        current={CURRENT}
      />,
    );
    expect(screen.getByText("לבדיקה")).toBeInTheDocument();
  });

  it("renders a Potential staffing problem as a plain row under a severity heading, never under a separate technical section", () => {
    render(<ManagerAttentionSection criticalItems={[potentialItem()]} reviewItems={[]} current={CURRENT} />);
    expect(screen.getByText("דחוף")).toBeInTheDocument();
    expect(screen.getByText("כונן פינויים")).toBeInTheDocument();
    expect(screen.queryByText(/Potential/)).toBeNull();
  });

  it("mixes issues and Potential problems within the same severity group, in the given order", () => {
    render(
      <ManagerAttentionSection
        criticalItems={[issueItem({ key: "i1" }), potentialItem({ key: "p1" })]}
        reviewItems={[]}
        current={CURRENT}
      />,
    );
    const panel = screen.getByText("דחוף").closest("section");
    const rows = panel?.querySelectorAll("li") ?? [];
    expect(rows.length).toBe(2);
  });

  it("renders both critical and review sections together without hiding either", () => {
    render(
      <ManagerAttentionSection
        criticalItems={[issueItem()]}
        reviewItems={[issueItem({ severity: "review", key: "k2" })]}
        current={CURRENT}
      />,
    );
    expect(screen.getByText("דחוף")).toBeInTheDocument();
    expect(screen.getByText("לבדיקה")).toBeInTheDocument();
  });

  it("lays each severity group out as a two-column-at-desktop grid, never a single shared panel", () => {
    render(<ManagerAttentionSection criticalItems={[issueItem()]} reviewItems={[]} current={CURRENT} />);
    const list = screen.getByText("דחוף").closest("section")?.querySelector("ul");
    expect(list?.className).toContain("grid");
    expect(list?.className).toContain("lg:grid-cols-2");
  });

  it("each item renders as its own bordered card, not a divided row sharing a panel", () => {
    render(<ManagerAttentionSection criticalItems={[issueItem()]} reviewItems={[]} current={CURRENT} />);
    const card = screen.getByText("חסר כיסוי למשמרת").closest("li");
    expect(card?.className).toContain("ring-border");
    expect(card?.className).not.toContain("divide-y");
  });

  it("preserves the given order within a severity group when it mixes issues and Potential problems", () => {
    render(
      <ManagerAttentionSection
        criticalItems={[
          potentialItem({ key: "p1", requirementTitle: "כונן ראשון" }),
          issueItem({ key: "i1", reasonLabel: "בעיה ראשונה" }),
          potentialItem({ key: "p2", requirementTitle: "כונן שני" }),
        ]}
        reviewItems={[]}
        current={CURRENT}
      />,
    );
    const list = screen.getByText("דחוף").closest("section")?.querySelector("ul");
    const titles = [...(list?.querySelectorAll("li") ?? [])].map((li) => li.textContent);
    expect(titles[0]).toContain("כונן ראשון");
    expect(titles[1]).toContain("בעיה ראשונה");
    expect(titles[2]).toContain("כונן שני");
  });
});
