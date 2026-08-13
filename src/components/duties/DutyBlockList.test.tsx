import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DutyBlockList } from "./DutyBlockList";
import type { DutyBlockView } from "./types";

afterEach(() => {
  cleanup();
});

function view(overrides: Partial<DutyBlockView> = {}): DutyBlockView {
  return {
    key: "guard-2-2026-08-19",
    emoji: "🧩",
    title: "עתודה 2",
    dateRangeLabel: "19–21 באוגוסט",
    dayCountLabel: "3 ימים",
    certaintyLabel: "משוער",
    weekendPartialWarning: false,
    isActive: false,
    progress: null,
    pending: { label: "בדיקות", items: ["19.8 · 13:00", "20.8 · 13:00"] },
    ...overrides,
  };
}

describe("DutyBlockList", () => {
  it("shows the empty message when there are no blocks", () => {
    render(<DutyBlockList blocks={[]} emptyMessage="אין תורנויות נוספות באופק הקרוב." />);
    expect(screen.getByText("אין תורנויות נוספות באופק הקרוב.")).toBeInTheDocument();
  });

  it("renders every block", () => {
    const a = view({ key: "a", title: "עתודה 1" });
    const b = view({ key: "b", title: "עתודה 2" });
    render(<DutyBlockList blocks={[a, b]} emptyMessage="empty" />);
    expect(screen.getByText("עתודה 1")).toBeInTheDocument();
    expect(screen.getByText("עתודה 2")).toBeInTheDocument();
  });

  it("shows an optional title heading when provided", () => {
    render(<DutyBlockList blocks={[view()]} emptyMessage="empty" title="היסטוריה אחרונה" />);
    expect(screen.getByText("היסטוריה אחרונה")).toBeInTheDocument();
  });

  it("shows the title even on the empty state, so history is still labeled as such", () => {
    render(<DutyBlockList blocks={[]} emptyMessage="אין עדיין היסטוריית תורנויות." title="היסטוריה אחרונה" />);
    expect(screen.getByText("היסטוריה אחרונה")).toBeInTheDocument();
    expect(screen.getByText("אין עדיין היסטוריית תורנויות.")).toBeInTheDocument();
  });
});
