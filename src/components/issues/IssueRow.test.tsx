import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { IssueRowView } from "./types";
import { IssueRow } from "./IssueRow";

afterEach(() => {
  cleanup();
});

function view(overrides: Partial<IssueRowView> = {}): IssueRowView {
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

describe("IssueRow — personal (no personName)", () => {
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

describe("IssueRow — manager everyone view (personName set)", () => {
  function managerView(overrides: Partial<IssueRowView> = {}): IssueRowView {
    return view({ personName: "מרטין בדיקה", reasonLabel: "חסר כיסוי למשמרת", ...overrides });
  }

  it("leads with the person's name, then their own role/shift on the same line", () => {
    const { container } = render(<IssueRow view={managerView({ targetEmoji: "🌙", targetTitle: 'אחמ"ש לילה' })} />);
    expect(screen.getByText("מרטין בדיקה")).toBeInTheDocument();
    expect(container.textContent).toContain('אחמ"ש לילה');
  });

  it("renders the finding as its own severity-tinted callout, separate from the name line", () => {
    render(<IssueRow view={managerView()} />);
    expect(screen.getByText("חסר כיסוי למשמרת")).toBeInTheDocument();
  });

  it("shows the missing-hours callout with manager-view wording", () => {
    render(<IssueRow view={managerView({ missingIntervalLabels: ["05:30–07:30"] })} />);
    expect(screen.getByText("שעות חסרות:")).toBeInTheDocument();
  });
});

describe("IssueRow — recommendation (secondary, collapsed)", () => {
  it("renders nothing recommendation-related when unset", () => {
    render(<IssueRow view={view()} />);
    expect(screen.queryByText("פעולה מומלצת")).toBeNull();
  });

  it("shows a collapsed disclosure only when a recommendation is present, never expanded by default", () => {
    render(<IssueRow view={view({ recommendation: "שקול לשבץ מישהו נוסף למשמרת." })} />);
    const summary = screen.getByText("פעולה מומלצת");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("שקול לשבץ מישהו נוסף למשמרת.")).toBeInTheDocument();
  });
});
