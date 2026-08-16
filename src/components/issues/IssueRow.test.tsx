import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { IssueRecommendationView } from "@/lib/presentation/issueRecommendation";
import type { IssueRowView } from "./types";
import { IssueRow } from "./IssueRow";

function recommendationView(overrides: Partial<IssueRecommendationView> = {}): IssueRecommendationView {
  return {
    primaryText: "לפי הסידור הקיים, אפשר לבדוק עם איתי לגבי הכיסוי.",
    disclaimer: "ייתכנו אילוצים אישיים שלא מופיעים במערכת.",
    lastResort: null,
    ...overrides,
  };
}

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

describe("IssueRow — recommendation (secondary, collapsed) [PR #37]", () => {
  it("35. renders nothing recommendation-related when unset", () => {
    render(<IssueRow view={view()} />);
    expect(screen.queryByText("פעולה מומלצת")).toBeNull();
  });

  it("35. shows a collapsed disclosure only when a recommendation is present, never expanded by default", () => {
    render(<IssueRow view={view({ recommendation: recommendationView() })} />);
    const summary = screen.getByText("פעולה מומלצת");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("לפי הסידור הקיים, אפשר לבדוק עם איתי לגבי הכיסוי.")).toBeInTheDocument();
  });

  it("36. renders the primary recommendation text verbatim", () => {
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: "לפי הסידור הקיים, אפשר לבדוק עם איתי אוליר או עילאי שפירא לגבי הכיסוי.",
          }),
        })}
      />,
    );
    expect(screen.getByText("לפי הסידור הקיים, אפשר לבדוק עם איתי אוליר או עילאי שפירא לגבי הכיסוי.")).toBeInTheDocument();
  });

  it("37. renders the disclaimer sentence when present", () => {
    render(<IssueRow view={view({ recommendation: recommendationView() })} />);
    expect(screen.getByText("ייתכנו אילוצים אישיים שלא מופיעים במערכת.")).toBeInTheDocument();
  });

  it("renders no disclaimer paragraph when disclaimer is null (the technician-exhausted case)", () => {
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({ primaryText: "לא נמצאו טכנאים מתאימים לפי המידע הקיים.", disclaimer: null }),
        })}
      />,
    );
    expect(screen.queryByText("ייתכנו אילוצים אישיים שלא מופיעים במערכת.")).toBeNull();
  });

  it("38/39. the last-resort disclosure is nested/secondary, collapsed independently, and absent when there's a normal recommendation", () => {
    render(<IssueRow view={view({ recommendation: recommendationView() })} />);
    expect(screen.queryByText("מוצא אחרון · הצג אפשרויות נוספות")).toBeNull();
  });

  it("38. exposes a NESTED collapsed last-resort disclosure, closed independently of the outer one", () => {
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: "לא נמצאו טכנאים מתאימים לפי המידע הקיים.",
            disclaimer: null,
            lastResort: {
              triggerLabel: "מוצא אחרון · הצג אפשרויות נוספות",
              text: "לא נמצאו טכנאים רגילים מתאימים. לפי הסידור הקיים, אפשר לבדוק גם עם טוביה כהן, שמסומן גם כבעל יכולת טכנית.",
              disclaimer: "האפשרויות האלו מוצגות כמוצא אחרון בלבד, וייתכנו אילוצים אישיים שלא מופיעים במערכת.",
            },
          }),
        })}
      />,
    );

    const outerSummary = screen.getByText("פעולה מומלצת");
    const lastResortSummary = screen.getByText("מוצא אחרון · הצג אפשרויות נוספות");
    expect(outerSummary.closest("details")).not.toHaveAttribute("open");
    expect(lastResortSummary.closest("details")).not.toHaveAttribute("open");
    // The nested <details> lives INSIDE the outer one, not a sibling.
    expect(outerSummary.closest("details")?.contains(lastResortSummary)).toBe(true);
    expect(
      screen.getByText(
        "לא נמצאו טכנאים רגילים מתאימים. לפי הסידור הקיים, אפשר לבדוק גם עם טוביה כהן, שמסומן גם כבעל יכולת טכנית.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("האפשרויות האלו מוצגות כמוצא אחרון בלבד, וייתכנו אילוצים אישיים שלא מופיעים במערכת."),
    ).toBeInTheDocument();
  });
});
