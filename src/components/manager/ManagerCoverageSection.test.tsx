import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerCoverageSection } from "./ManagerCoverageSection";
import type { ManagerShiftGroupView } from "./types";

afterEach(() => {
  cleanup();
});

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

  it("shows the missing-coverage callout only for partial/missing status", () => {
    render(
      <ManagerCoverageSection
        groups={[group({ coverageStatus: "missing", missingIntervalLabels: ["05:30–07:30"] })]}
      />,
    );
    expect(screen.getByText(/05:30–07:30/)).toBeInTheDocument();
  });

  it("never shows the missing-coverage callout for full coverage", () => {
    render(<ManagerCoverageSection groups={[group({ coverageStatus: "full" })]} />);
    expect(screen.queryByText("חסר כיסוי:")).toBeNull();
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
