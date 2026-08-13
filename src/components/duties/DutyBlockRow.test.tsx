import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DutyBlockRow } from "./DutyBlockRow";
import type { DutyBlockView } from "./types";

afterEach(() => {
  cleanup();
});

function view(overrides: Partial<DutyBlockView> = {}): DutyBlockView {
  return {
    key: "guard-2-2026-08-12",
    emoji: "🛡️",
    title: "שמירה 2",
    dateRangeLabel: "12–14 באוגוסט",
    dayCountLabel: "3 ימים",
    certaintyLabel: null,
    weekendPartialWarning: false,
    isActive: false,
    progress: null,
    pending: null,
    ...overrides,
  };
}

describe("DutyBlockRow", () => {
  it("shows the emoji and title", () => {
    render(<DutyBlockRow view={view()} />);
    expect(screen.getByText("🛡️")).toBeInTheDocument();
    expect(screen.getByText("שמירה 2")).toBeInTheDocument();
  });

  it("renders cleanly without an emoji when the family has none", () => {
    const { container } = render(<DutyBlockRow view={view({ emoji: null, title: 'רס"ר' })} />);
    expect(screen.getByText('רס"ר')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it("shows the date range and day count", () => {
    render(<DutyBlockRow view={view()} />);
    expect(screen.getByText("12–14 באוגוסט · 3 ימים")).toBeInTheDocument();
  });

  it("shows a 'פעיל' badge only when active", () => {
    const { rerender } = render(<DutyBlockRow view={view({ isActive: true })} />);
    expect(screen.getByText("פעיל")).toBeInTheDocument();
    rerender(<DutyBlockRow view={view({ isActive: false })} />);
    expect(screen.queryByText("פעיל")).toBeNull();
  });

  it("shows day-progress only when provided", () => {
    render(<DutyBlockRow view={view({ isActive: true, progress: { dayIndex: 2, totalDays: 3 } })} />);
    expect(screen.getByText("יום 2 מתוך 3")).toBeInTheDocument();
  });

  it("omits the redundant 'day 1 of 1' progress line for a single-day active block", () => {
    render(<DutyBlockRow view={view({ isActive: true, progress: { dayIndex: 1, totalDays: 1 } })} />);
    expect(screen.queryByText(/מתוך/)).toBeNull();
  });

  it("shows the certainty badge text exactly, never a raw enum string", () => {
    render(<DutyBlockRow view={view({ certaintyLabel: "חלקית משוער" })} />);
    expect(screen.getByText("חלקית משוער")).toBeInTheDocument();
    expect(screen.queryByText("mixed")).toBeNull();
    expect(screen.queryByText("tentative")).toBeNull();
  });

  it('shows a quiet "סופ"ש חלקי" badge only when flagged', () => {
    const { rerender } = render(<DutyBlockRow view={view({ weekendPartialWarning: true })} />);
    expect(screen.getByText('סופ"ש חלקי')).toBeInTheDocument();
    rerender(<DutyBlockRow view={view({ weekendPartialWarning: false })} />);
    expect(screen.queryByText('סופ"ש חלקי')).toBeNull();
  });

  it("shows a singular 'בדיקה' line for one today-due pending action", () => {
    render(<DutyBlockRow view={view({ pending: { label: "בדיקה", items: ["היום · 13:00"] } })} />);
    expect(screen.getByText(/בדיקה/)).toBeInTheDocument();
    expect(screen.getByText(/היום · 13:00/)).toBeInTheDocument();
  });

  it("shows a plural 'בדיקות' line for multiple pending actions", () => {
    render(
      <DutyBlockRow
        view={view({ pending: { label: "בדיקות", items: ["19.8 · 13:00", "20.8 · 13:00"] } })}
      />,
    );
    expect(screen.getByText(/בדיקות/)).toBeInTheDocument();
    expect(screen.getByText(/19\.8 · 13:00 · 20\.8 · 13:00/)).toBeInTheDocument();
  });

  it("shows no pending line when nothing is pending", () => {
    render(<DutyBlockRow view={view({ pending: null })} />);
    expect(screen.queryByText(/בדיקה/)).toBeNull();
  });
});
