import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerCoverageSection } from "./ManagerCoverageSection";
import type { ManagerRoleCoverageRowView, ManagerShiftDayView, ManagerShiftGroupView } from "./types";

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

function dayView(overrides: Partial<ManagerShiftDayView> = {}): ManagerShiftDayView {
  return {
    key: "2026-08-13",
    date: "2026-08-13",
    dateLabel: "היום",
    day: group(),
    night: null,
    ...overrides,
  };
}

describe("ManagerCoverageSection", () => {
  it("shows an empty message when there are no days with shift data", () => {
    render(<ManagerCoverageSection days={[]} />);
    expect(screen.getByText("אין משמרות בטווח שנבחר.")).toBeInTheDocument();
  });

  it("preserves multiple technicians in one period, never collapsed to one", () => {
    render(<ManagerCoverageSection days={[dayView({ day: group({ technicianNames: ["מרטין בדיקה", "נועה דוגמה"] }) })]} />);
    expect(screen.getByText(/מרטין בדיקה, נועה דוגמה/)).toBeInTheDocument();
  });

  it("keeps shadow people in their own separate line", () => {
    render(
      <ManagerCoverageSection
        days={[dayView({ day: group({ technicianNames: ["מרטין בדיקה"], shadowTechnicianNames: ["איתן דוגמה"] }) })]}
      />,
    );
    expect(screen.getByText(/צל טכנאי/)).toBeInTheDocument();
  });

  describe('role presentation order: אחמ"ש before טכנאי (shared with the calendar/selected-day views via inRoleDisplayOrder)', () => {
    it("renders the אחמ״שים coverage line before the טכנאים line, for a period staffed with both", () => {
      const { container } = render(
        <ManagerCoverageSection
          days={[dayView({ day: group({ technicianNames: ["גדעון פולין"], supervisorNames: ["איתי אוליר"] }) })]}
        />,
      );
      const supervisorLine = screen.getByText(/אחמ״שים/).closest("p")!;
      const technicianLine = screen.getByText(/טכנאים/).closest("p")!;
      expect(
        supervisorLine.compareDocumentPosition(technicianLine) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Both names are still present, each attributed to their own real role.
      expect(container.textContent).toContain("איתי אוליר");
      expect(container.textContent).toContain("גדעון פולין");
    });

    it("renders the shadow אחמ״ש line before the shadow טכנאי line", () => {
      render(
        <ManagerCoverageSection
          days={[
            dayView({
              day: group({ shadowSupervisorNames: ["נועה דוגמה"], shadowTechnicianNames: ["דני בדיקה"] }),
            }),
          ]}
        />,
      );
      const shadowSupervisorLine = screen.getByText(/צל אחמ״ש/).closest("p")!;
      const shadowTechnicianLine = screen.getByText(/צל טכנאי/).closest("p")!;
      expect(
        shadowSupervisorLine.compareDocumentPosition(shadowTechnicianLine) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("applies the same order to a missing/partial role's message line too, not just the full-coverage name line", () => {
      render(
        <ManagerCoverageSection
          days={[
            dayView({
              day: group({
                coverageStatus: "missing",
                technicianCoverage: coverage({ status: "missing", message: "חסר טכנאי" }),
                supervisorCoverage: coverage({ status: "missing", message: 'חסר אחמ"ש' }),
              }),
            }),
          ]}
        />,
      );
      const supervisorLine = screen.getByText(/חסר אחמ"ש/).closest("p")!;
      const technicianLine = screen.getByText(/חסר טכנאי/).closest("p")!;
      expect(
        supervisorLine.compareDocumentPosition(technicianLine) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("applies the same order independently to BOTH the day and night columns", () => {
      render(
        <ManagerCoverageSection
          days={[
            dayView({
              day: group({ key: "day", technicianNames: ["טכנאי יום"], supervisorNames: ['אחמ"ש יום'] }),
              night: group({
                key: "night",
                periodLabel: "לילה",
                emoji: "🌙",
                technicianNames: ["טכנאי לילה"],
                supervisorNames: ['אחמ"ש לילה'],
              }),
            }),
          ]}
        />,
      );
      const [dayLine, nightLine] = screen.getAllByText(/אחמ״שים/).map((el) => el.closest("p")!);
      const dayNames = dayLine.textContent ?? "";
      const nightNames = nightLine.textContent ?? "";
      expect(dayNames).toContain('אחמ"ש יום');
      expect(nightNames).toContain('אחמ"ש לילה');
      const dayTechLine = screen.getByText("טכנאי יום").closest("p")!;
      const nightTechLine = screen.getByText("טכנאי לילה").closest("p")!;
      expect(dayLine.compareDocumentPosition(dayTechLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(nightLine.compareDocumentPosition(nightTechLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('explicitly states "חסר טכנאי" for a fully missing technician role, never inferred from an empty name list', () => {
    render(
      <ManagerCoverageSection
        days={[
          dayView({
            day: group({ coverageStatus: "missing", technicianCoverage: coverage({ status: "missing", message: "חסר טכנאי" }) }),
          }),
        ]}
      />,
    );
    expect(screen.getByText("חסר טכנאי")).toBeInTheDocument();
  });

  it('explicitly states "חסר אחמ״ש" for a fully missing supervisor role', () => {
    render(
      <ManagerCoverageSection
        days={[
          dayView({
            day: group({ coverageStatus: "missing", supervisorCoverage: coverage({ status: "missing", message: "חסר אחמ״ש" }) }),
          }),
        ]}
      />,
    );
    expect(screen.getByText("חסר אחמ״ש")).toBeInTheDocument();
  });

  it("shows the partial interval message for a partially covered role", () => {
    render(
      <ManagerCoverageSection
        days={[
          dayView({
            day: group({
              coverageStatus: "partial",
              technicianCoverage: coverage({ status: "partial", message: "כיסוי טכנאי חלקי · 05:30–07:30" }),
              technicianNames: ["מרטין בדיקה"],
            }),
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
        days={[
          dayView({
            day: group({
              coverageStatus: "not_evaluable",
              technicianCoverage: coverage({ status: "not_evaluable", message: "לא ניתן להעריך כיסוי טכנאי" }),
            }),
          }),
        ]}
      />,
    );
    expect(screen.getByText("לא ניתן להעריך כיסוי טכנאי")).toBeInTheDocument();
    expect(screen.queryByText("חסר טכנאי")).toBeNull();
  });

  it("shows a calm names-only line for a fully covered role, no extra message", () => {
    render(<ManagerCoverageSection days={[dayView({ day: group({ supervisorNames: ["דני כהן"] }) })]} />);
    expect(screen.getByText(/דני כהן/)).toBeInTheDocument();
  });

  it("renders one card per date, with day and night paired inside the same card", () => {
    const { container } = render(
      <ManagerCoverageSection
        days={[
          dayView({ key: "2026-08-13", date: "2026-08-13", day: group(), night: group({ periodLabel: "לילה", emoji: "🌙" }) }),
          dayView({ key: "2026-08-14", date: "2026-08-14", day: group(), night: null }),
        ]}
      />,
    );
    // One card per date (both columns always render, "אין נתוני שיבוץ" for a period with no data).
    expect(container.querySelectorAll('[href^="/schedule?person=all"]').length).toBe(2);
    expect(screen.getAllByText("יום").length).toBe(2);
    expect(screen.getAllByText("לילה").length).toBe(2);
    expect(screen.getAllByText("אין נתוני שיבוץ").length).toBe(1);
  });

  it("a period with no shift data at all reads as 'no data', never a fabricated missing verdict", () => {
    render(<ManagerCoverageSection days={[dayView({ day: group(), night: null })]} />);
    expect(screen.getByText("אין נתוני שיבוץ")).toBeInTheDocument();
  });

  it("each card links into the real team calendar for that exact date", () => {
    render(<ManagerCoverageSection days={[dayView({ date: "2026-08-19" })]} />);
    expect(screen.getByRole("link", { name: "ללוח ←" })).toHaveAttribute(
      "href",
      "/schedule?person=all&date=2026-08-19",
    );
  });

  it("a problematic date carries a visible accent, a fully-covered date does not", () => {
    const { container } = render(
      <ManagerCoverageSection
        days={[
          dayView({ key: "ok", date: "2026-08-13", day: group({ coverageStatus: "full" }) }),
          dayView({ key: "bad", date: "2026-08-14", day: group({ coverageStatus: "missing" }) }),
        ]}
      />,
    );
    const cards = container.querySelectorAll(".rounded-xl.bg-surface-1");
    const withAccent = [...cards].filter((card) => card.className.includes("border-s-critical"));
    expect(withAccent.length).toBe(1);
  });
});
