import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DutyFocusSection } from "./DutyFocusSection";
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
    isActive: true,
    progress: { dayIndex: 2, totalDays: 3 },
    pending: null,
    ...overrides,
  };
}

describe("DutyFocusSection", () => {
  it("shows the calm empty state when there is nothing active or upcoming, never fabricating one", () => {
    render(<DutyFocusSection status="none" blocks={[]} holiday={null} />);
    expect(screen.getByText("אין לך תורנויות קרובות")).toBeInTheDocument();
    expect(screen.getByText("🎉")).toBeInTheDocument();
  });

  it('shows "בתורנות עכשיו" for the active state', () => {
    render(<DutyFocusSection status="active" blocks={[view()]} holiday={null} />);
    expect(screen.getByText("בתורנות עכשיו")).toBeInTheDocument();
  });

  it('shows "התורנות הבאה" for the next state', () => {
    render(
      <DutyFocusSection
        status="next"
        blocks={[view({ isActive: false, progress: null })]}
        holiday={null}
      />,
    );
    expect(screen.getByText("התורנות הבאה")).toBeInTheDocument();
  });

  it("shows ALL active blocks, never collapsing multiple simultaneous duties to one", () => {
    const a = view({ key: "a", title: "שמירה 1" });
    const b = view({ key: "b", title: "מטבח מלא", emoji: "🍽️" });
    render(<DutyFocusSection status="active" blocks={[a, b]} holiday={null} />);
    expect(screen.getByText("שמירה 1")).toBeInTheDocument();
    expect(screen.getByText("מטבח מלא")).toBeInTheDocument();
  });

  it("shows a holiday chip when provided", () => {
    render(
      <DutyFocusSection status="active" blocks={[view()]} holiday={{ emoji: "🍎", label: "ראש השנה" }} />,
    );
    expect(screen.getByText("ראש השנה")).toBeInTheDocument();
    expect(screen.getByText("🍎")).toBeInTheDocument();
  });

  it("shows no holiday chip when null", () => {
    render(<DutyFocusSection status="active" blocks={[view()]} holiday={null} />);
    expect(screen.queryByText("🍎")).toBeNull();
  });
});
