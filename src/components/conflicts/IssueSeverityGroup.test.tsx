import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ConflictIssueView } from "./types";
import { IssueSeverityGroup } from "./IssueSeverityGroup";

afterEach(() => {
  cleanup();
});

function view(overrides: Partial<ConflictIssueView> = {}): ConflictIssueView {
  return {
    key: "k1",
    severity: "critical",
    reasonLabel: "חסר כיסוי למשמרת שלך",
    dateLabel: "היום",
    targetEmoji: null,
    targetTitle: null,
    missingIntervalLabels: null,
    explanation: null,
    guidance: "בדוק מי אמור להשלים את הכיסוי למשמרת.",
    ...overrides,
  };
}

describe("IssueSeverityGroup", () => {
  it("renders nothing when there are no issues at this severity", () => {
    const { container } = render(<IssueSeverityGroup severity="info" views={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the friendly severity label and count, never the raw enum value", () => {
    render(<IssueSeverityGroup severity="critical" views={[view(), view({ key: "k2" })]} />);
    expect(screen.getByText("דחוף")).toBeInTheDocument();
    expect(screen.getByText("· 2")).toBeInTheDocument();
    expect(screen.queryByText(/critical/)).toBeNull();
  });

  it("renders every issue as its own list row, never collapsed", () => {
    const { container } = render(
      <IssueSeverityGroup
        severity="review"
        views={[view({ key: "a", severity: "review" }), view({ key: "b", severity: "review" })]}
      />,
    );
    expect(container.querySelectorAll("li").length).toBe(2);
  });

  describe("critical visual treatment (Design Pass PR #20)", () => {
    it("critical gets the pulse marker and the critical surface", () => {
      const { container } = render(<IssueSeverityGroup severity="critical" views={[view()]} />);
      expect(container.querySelector(".animate-pulse-dot")).not.toBeNull();
      expect(container.querySelector(".animate-pulse-ring")).not.toBeNull();
      expect(container.querySelector(".bg-surface-critical")).not.toBeNull();
    });

    it("critical's heading also communicates status via text/color, not motion alone", () => {
      render(<IssueSeverityGroup severity="critical" views={[view()]} />);
      const heading = screen.getByText("דחוף").closest("h2");
      expect(heading?.className).toMatch(/text-critical/);
    });

    it("review never receives the critical pulse marker or surface", () => {
      const { container } = render(
        <IssueSeverityGroup severity="review" views={[view({ severity: "review" })]} />,
      );
      expect(container.querySelector(".animate-pulse-dot")).toBeNull();
      expect(container.querySelector(".animate-pulse-ring")).toBeNull();
      expect(container.querySelector(".bg-surface-critical")).toBeNull();
    });

    it("info never receives the critical pulse marker or surface", () => {
      const { container } = render(<IssueSeverityGroup severity="info" views={[view({ severity: "info" })]} />);
      expect(container.querySelector(".animate-pulse-dot")).toBeNull();
      expect(container.querySelector(".animate-pulse-ring")).toBeNull();
      expect(container.querySelector(".bg-surface-critical")).toBeNull();
    });

    it("the pulse animation classes are covered by the global prefers-reduced-motion rule", () => {
      const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");
      const reducedBlockMatch = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{([\s\S]*)}\s*$/);
      expect(reducedBlockMatch).not.toBeNull();
      const reducedBlock = reducedBlockMatch?.[1] ?? "";
      expect(reducedBlock).toContain(".animate-pulse-dot");
      expect(reducedBlock).toContain(".animate-pulse-ring");
    });
  });
});
