import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
});
