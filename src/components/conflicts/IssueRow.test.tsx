import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ConflictIssueView } from "./types";
import { IssueRow } from "./IssueRow";

afterEach(() => {
  cleanup();
});

function view(overrides: Partial<ConflictIssueView> = {}): ConflictIssueView {
  return {
    key: "k1",
    severity: "critical",
    reasonLabel: "חסר כיסוי למשמרת שלך",
    dateLabel: "יום ראשון · 16 באוגוסט",
    targetEmoji: null,
    targetTitle: null,
    missingIntervalLabels: null,
    explanation: null,
    guidance: "בדוק מי אמור להשלים את הכיסוי למשמרת.",
    ...overrides,
  };
}

describe("IssueRow", () => {
  it("shows the reason title, date, and guidance", () => {
    render(<IssueRow view={view()} />);
    expect(screen.getByText("חסר כיסוי למשמרת שלך")).toBeInTheDocument();
    expect(screen.getByText("יום ראשון · 16 באוגוסט")).toBeInTheDocument();
    expect(screen.getByText("בדוק מי אמור להשלים את הכיסוי למשמרת.")).toBeInTheDocument();
  });

  it("shows the target emoji + title when present", () => {
    render(<IssueRow view={view({ targetEmoji: "🌙", targetTitle: 'אחמ"ש לילה' })} />);
    expect(screen.getByText("🌙")).toBeInTheDocument();
    expect(screen.getByText('אחמ"ש לילה')).toBeInTheDocument();
  });

  it("renders nothing target-related when targetEvent was null", () => {
    const { container } = render(<IssueRow view={view({ targetEmoji: null, targetTitle: null })} />);
    expect(container.querySelector('[dir="ltr"]')).toBeNull();
  });

  it("shows the missing-coverage callout, bidi-safe, in domain order", () => {
    render(<IssueRow view={view({ missingIntervalLabels: ["05:30–07:30", "19:30–20:30"] })} />);
    expect(screen.getByText("חסר כיסוי:")).toBeInTheDocument();
    const range = screen.getByText("05:30–07:30 · 19:30–20:30");
    expect(range).toHaveAttribute("dir", "ltr");
  });

  it("never fabricates a missing-coverage callout when there are no intervals", () => {
    render(<IssueRow view={view({ missingIntervalLabels: null })} />);
    expect(screen.queryByText("חסר כיסוי:")).toBeNull();
  });

  it("shows the explanation text when present", () => {
    render(
      <IssueRow
        view={view({ explanation: "יש באותו יום גם היעדרות חוסמת וגם שיבוץ פעיל. כדאי לבדוק איזה מהם נכון בסידור." })}
      />,
    );
    expect(screen.getByText(/היעדרות חוסמת/)).toBeInTheDocument();
  });
});
