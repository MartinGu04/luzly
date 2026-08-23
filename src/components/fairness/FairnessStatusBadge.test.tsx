import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FairnessStatusBadge } from "./FairnessStatusBadge";

afterEach(() => {
  cleanup();
});

describe("FairnessStatusBadge", () => {
  it.each([
    ["below", "מתחת ליעד"],
    ["balanced", "מאוזן"],
    ["above", "מעל היעד"],
  ] as const)("%s renders its Hebrew label", (status, label) => {
    render(<FairnessStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("null status renders its own honest, GENERIC label, never a fourth color-coded verdict and never naming a specific missing piece", () => {
    render(<FairnessStatusBadge status={null} />);
    expect(screen.getByText("לא ניתן להשוות")).toBeInTheDocument();
    expect(screen.queryByText(/יעד/)).toBeNull();
  });

  it("below/balanced/above each get their own restrained tint, but none uses an aggressive raw red/green Tailwind utility", () => {
    const { container: belowContainer } = render(<FairnessStatusBadge status="below" />);
    const belowClass = belowContainer.querySelector("span")?.className ?? "";
    cleanup();
    const { container: balancedContainer } = render(<FairnessStatusBadge status="balanced" />);
    const balancedClass = balancedContainer.querySelector("span")?.className ?? "";
    cleanup();
    const { container: aboveContainer } = render(<FairnessStatusBadge status="above" />);
    const aboveClass = aboveContainer.querySelector("span")?.className ?? "";

    // Distinct tones -- not a copy/paste of the same neutral pill for all three.
    expect(belowClass).not.toBe(balancedClass);
    expect(balancedClass).not.toBe(aboveClass);
    expect(belowClass).not.toBe(aboveClass);

    // Never a saturated traffic-light utility class (bg-red-*, bg-green-*, text-red-*, ...).
    for (const cls of [belowClass, balancedClass, aboveClass]) {
      expect(cls).not.toMatch(/-(red|green)-\d/);
    }
  });

  it("null (unavailable) stays fully neutral gray, distinct from every real status tint", () => {
    const { container } = render(<FairnessStatusBadge status={null} />);
    const className = container.querySelector("span")?.className ?? "";
    expect(className).toContain("text-muted");
    expect(className).not.toMatch(/status-(below|balanced|above)/);
  });

  it("status is never communicated by color alone -- text is always present alongside the icon", () => {
    render(<FairnessStatusBadge status="above" />);
    const badge = screen.getByText("מעל היעד");
    expect(badge.textContent).toContain("מעל היעד");
  });

  it("an explicit `label` overrides the default fairnessStatusLabel text, e.g. Shift Fairness's own 'expected' vocabulary", () => {
    render(<FairnessStatusBadge status="above" label="מעל הצפוי" />);
    expect(screen.getByText("מעל הצפוי")).toBeInTheDocument();
    expect(screen.queryByText("מעל היעד")).toBeNull();
  });

  it("an overridden label keeps the status-driven icon/tint unchanged", () => {
    const { container } = render(<FairnessStatusBadge status="above" label="מעל הצפוי" />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("status-above");
  });
});
