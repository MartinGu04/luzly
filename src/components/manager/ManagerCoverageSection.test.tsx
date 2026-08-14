import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerCoverageSection } from "./ManagerCoverageSection";
import type { ManagerRoleCoverageRowView, ManagerShiftGroupView } from "./types";

afterEach(() => {
  cleanup();
});

function coverage(overrides: Partial<ManagerRoleCoverageRowView> = {}): ManagerRoleCoverageRowView {
  return { status: "full", message: null, ...overrides };
}

function group(overrides: Partial<ManagerShiftGroupView> = {}): ManagerShiftGroupView {
  return {
    key: "2026-08-13-day",
    dateLabel: "היום",
    periodLabel: "יום",
    emoji: "☀️",
    technicianNames: [],
    supervisorNames: [],
    shadowTechnicianNames: [],
    shadowSupervisorNames: [],
    coverageStatus: "full",
    missingIntervalLabels: [],
    technicianCoverage: coverage(),
    supervisorCoverage: coverage(),
    ...overrides,
  };
}

describe("ManagerCoverageSection", () => {
  it("shows an empty message when there are no shift groups", () => {
    render(<ManagerCoverageSection groups={[]} />);
    expect(screen.getByText("אין משמרות בטווח שנבחר.")).toBeInTheDocument();
  });

  it("preserves multiple technicians in one group, never collapsed to one", () => {
    render(<ManagerCoverageSection groups={[group({ technicianNames: ["מרטין בדיקה", "נועה דוגמה"] })]} />);
    expect(screen.getByText(/מרטין בדיקה, נועה דוגמה/)).toBeInTheDocument();
  });

  it("keeps shadow people in their own separate line", () => {
    render(
      <ManagerCoverageSection
        groups={[group({ technicianNames: ["מרטין בדיקה"], shadowTechnicianNames: ["איתן דוגמה"] })]}
      />,
    );
    expect(screen.getByText(/צל טכנאי/)).toBeInTheDocument();
  });

  it('explicitly states "חסר טכנאי" for a fully missing technician role, never inferred from an empty name list', () => {
    render(
      <ManagerCoverageSection
        groups={[
          group({
            coverageStatus: "missing",
            technicianCoverage: coverage({ status: "missing", message: "חסר טכנאי" }),
          }),
        ]}
      />,
    );
    expect(screen.getByText("חסר טכנאי")).toBeInTheDocument();
  });

  it('explicitly states "חסר אחמ״ש" for a fully missing supervisor role', () => {
    render(
      <ManagerCoverageSection
        groups={[
          group({
            coverageStatus: "missing",
            supervisorCoverage: coverage({ status: "missing", message: "חסר אחמ״ש" }),
          }),
        ]}
      />,
    );
    expect(screen.getByText("חסר אחמ״ש")).toBeInTheDocument();
  });

  it("shows the partial interval message for a partially covered role", () => {
    render(
      <ManagerCoverageSection
        groups={[
          group({
            coverageStatus: "partial",
            technicianCoverage: coverage({
              status: "partial",
              message: "כיסוי טכנאי חלקי · 05:30–07:30",
            }),
            technicianNames: ["מרטין בדיקה"],
          }),
        ]}
      />,
    );
    expect(screen.getByText(/כיסוי טכנאי חלקי · 05:30–07:30/)).toBeInTheDocument();
    expect(screen.getByText(/מרטין בדיקה/)).toBeInTheDocument();
  });

  it("never claims a role missing when it is not_evaluable -- shows the truthful unknown message instead", () => {
    render(
      <ManagerCoverageSection
        groups={[
          group({
            coverageStatus: "not_evaluable",
            technicianCoverage: coverage({ status: "not_evaluable", message: "לא ניתן להעריך כיסוי טכנאי" }),
          }),
        ]}
      />,
    );
    expect(screen.getByText("לא ניתן להעריך כיסוי טכנאי")).toBeInTheDocument();
    expect(screen.queryByText("חסר טכנאי")).toBeNull();
  });

  it("shows a calm names-only line for a fully covered role, no extra message", () => {
    render(<ManagerCoverageSection groups={[group({ supervisorNames: ["דני כהן"] })]} />);
    expect(screen.getByText(/דני כהן/)).toBeInTheDocument();
  });

  it("renders every group, one per date+period", () => {
    const { container } = render(
      <ManagerCoverageSection
        groups={[group({ key: "a" }), group({ key: "b", periodLabel: "לילה", emoji: "🌙" })]}
      />,
    );
    expect(container.querySelectorAll("h3").length).toBe(2);
  });
});
