import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { IssueSeverityBadge } from "./IssueSeverityBadge";

afterEach(() => {
  cleanup();
});

describe("IssueSeverityBadge", () => {
  it("critical: red/critical color, pulsing", () => {
    const { container } = render(<IssueSeverityBadge severity="critical" />);
    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("class")).toContain("text-critical");
    expect(icon?.getAttribute("class")).toContain("animate-issue-pulse");
  });

  it("review: warning color, never pulsing", () => {
    const { container } = render(<IssueSeverityBadge severity="review" />);
    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("class")).toContain("text-warning");
    expect(icon?.getAttribute("class")).not.toContain("animate-issue-pulse");
  });

  it("info: neutral accent color, never pulsing", () => {
    const { container } = render(<IssueSeverityBadge severity="info" />);
    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("class")).toContain("text-accent");
    expect(icon?.getAttribute("class")).not.toContain("animate-issue-pulse");
  });

  it("each severity renders a visually distinct icon", () => {
    const critical = render(<IssueSeverityBadge severity="critical" />);
    const criticalTag = critical.container.querySelector("svg")?.getAttribute("class");
    critical.unmount();

    const review = render(<IssueSeverityBadge severity="review" />);
    const reviewTag = review.container.querySelector("svg")?.getAttribute("class");
    review.unmount();

    expect(criticalTag).not.toBe(reviewTag);
  });

  it("is hidden from assistive tech (decorative, paired with visible text elsewhere)", () => {
    const { container } = render(<IssueSeverityBadge severity="critical" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
