import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ConflictsSummary } from "./ConflictsSummary";

afterEach(() => {
  cleanup();
});

describe("ConflictsSummary", () => {
  it("shows the given already-formatted summary text verbatim", () => {
    render(<ConflictsSummary summary="1 דחוף · 1 לבדיקה" hasCritical />);
    expect(screen.getByText("1 דחוף · 1 לבדיקה")).toBeInTheDocument();
  });

  it("gets a critical/red treatment when hasCritical is true", () => {
    render(<ConflictsSummary summary="1 דחוף · 1 לבדיקה" hasCritical />);
    expect(screen.getByText("1 דחוף · 1 לבדיקה").className).toMatch(/text-critical/);
  });

  it("stays neutral when hasCritical is false", () => {
    render(<ConflictsSummary summary="1 לבדיקה · 1 לתשומת לב" hasCritical={false} />);
    expect(screen.getByText("1 לבדיקה · 1 לתשומת לב").className).not.toMatch(/text-critical/);
  });

  it("shows a subtle pulse indicator when hasCritical is true, reusing the shared PulseIndicator", () => {
    const { container } = render(<ConflictsSummary summary="1 דחוף · 1 לבדיקה" hasCritical />);
    expect(container.querySelector(".animate-pulse-dot")).toBeInTheDocument();
  });

  it("never shows a pulse indicator when hasCritical is false", () => {
    const { container } = render(<ConflictsSummary summary="1 לבדיקה · 1 לתשומת לב" hasCritical={false} />);
    expect(container.querySelector(".animate-pulse-dot")).toBeNull();
  });
});
