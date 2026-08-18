import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerPotentialSection } from "./ManagerPotentialSection";
import type { ManagerPotentialRowView } from "./types";

afterEach(() => {
  cleanup();
});

function row(overrides: Partial<ManagerPotentialRowView> = {}): ManagerPotentialRowView {
  return {
    key: "2026-08-13-oxid",
    dateLabel: "היום",
    requirementTitle: "אוקסיד 3",
    sourceAllocationLabel: "מרטין בדיקה",
    actualAssigneeNames: ["מרטין בדיקה"],
    status: "covered",
    sourceConflictNote: null,
    ...overrides,
  };
}

describe("ManagerPotentialSection", () => {
  it("shows an empty message when there are no requirements", () => {
    render(<ManagerPotentialSection rows={[]} />);
    expect(screen.getByText("אין דרישות Potential בטווח שנבחר.")).toBeInTheDocument();
  });

  it("collapses the full reconciliation behind a disclosure, closed by default", () => {
    render(<ManagerPotentialSection rows={[row()]} />);
    const summary = screen.getByText(/הצלבה מלאה מול Potential/);
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("the disclosure trigger states the total row count", () => {
    render(<ManagerPotentialSection rows={[row({ key: "a" }), row({ key: "b" })]} />);
    expect(screen.getByText("2", { exact: false })).toBeInTheDocument();
  });

  it("still renders every row (never filtered), reachable once expanded", () => {
    render(<ManagerPotentialSection rows={[row({ requirementTitle: "אוקסיד 3" })]} />);
    expect(screen.getByText("אוקסיד 3")).toBeInTheDocument();
  });
});
