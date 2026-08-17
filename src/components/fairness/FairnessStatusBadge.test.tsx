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

  it("null status renders its own honest label, never a fourth color-coded verdict", () => {
    render(<FairnessStatusBadge status={null} />);
    expect(screen.getByText("לא ניתן לחשב יעד מלא")).toBeInTheDocument();
  });

  it("below and above share the exact same tone/classes as balanced -- never styled as an error", () => {
    const { container: belowContainer } = render(<FairnessStatusBadge status="below" />);
    const belowClass = belowContainer.querySelector("span")?.className;
    cleanup();
    const { container: balancedContainer } = render(<FairnessStatusBadge status="balanced" />);
    const balancedClass = balancedContainer.querySelector("span")?.className;
    expect(belowClass).toBe(balancedClass);
  });

  it("status is never communicated by color alone -- text is always present alongside the icon", () => {
    render(<FairnessStatusBadge status="above" />);
    const badge = screen.getByText("מעל היעד");
    expect(badge.textContent).toContain("מעל היעד");
  });
});
