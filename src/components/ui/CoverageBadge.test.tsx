import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CoverageBadge } from "./CoverageBadge";

afterEach(() => {
  cleanup();
});

describe("CoverageBadge", () => {
  it("full coverage renders a quiet, calm success tone", () => {
    const { container } = render(<CoverageBadge status="full" />);
    expect(screen.getByText("הכיסוי מלא")).toBeInTheDocument();
    expect(container.querySelector(".text-success")).not.toBeNull();
    expect(container.querySelector(".animate-issue-pulse")).toBeNull();
  });

  it("partial coverage renders a noticeable warning tone", () => {
    const { container } = render(<CoverageBadge status="partial" />);
    expect(screen.getByText("הכיסוי חלקי")).toBeInTheDocument();
    expect(container.querySelector(".text-warning")).not.toBeNull();
  });

  it("missing coverage renders a critical, attention-grabbing tone", () => {
    const { container } = render(<CoverageBadge status="missing" />);
    expect(screen.getByText("אין כיסוי")).toBeInTheDocument();
    expect(container.querySelector(".text-critical")).not.toBeNull();
    expect(container.querySelector(".animate-issue-pulse")).not.toBeNull();
  });

  it("not_evaluable coverage renders neutral copy, not an alarm", () => {
    const { container } = render(<CoverageBadge status="not_evaluable" />);
    expect(screen.getByText("לא ניתן להעריך כיסוי")).toBeInTheDocument();
    expect(container.querySelector(".text-critical")).toBeNull();
    expect(container.querySelector(".text-warning")).toBeNull();
  });

  it("never renders a raw enum string", () => {
    render(<CoverageBadge status="not_evaluable" />);
    expect(screen.queryByText("not_evaluable")).toBeNull();
  });
});
