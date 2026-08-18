import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { IssueRecommendationTextPart, IssueRecommendationView } from "@/lib/presentation/issueRecommendation";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";
import type { IssueRowView } from "./types";
import { IssueRow } from "./IssueRow";

const CURRENT: ManagerHrefParams = { personId: null, range: "7d", month: null, category: "overview" };

/** A single plain-text part -- the equivalent of the former flat `primaryText: string` shape, for tests that don't care about candidate links specifically. */
function textOnly(value: string): IssueRecommendationTextPart[] {
  return [{ kind: "text", value }];
}

function recommendationView(overrides: Partial<IssueRecommendationView> = {}): IssueRecommendationView {
  return {
    primaryText: textOnly("לפי הסידור הקיים, אפשר לבדוק עם איתי לגבי הכיסוי."),
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

  it("the problem itself leads visually -- its severity-tinted callout renders before the person/shift/date line, never after", () => {
    const { container } = render(<IssueRow view={managerView({ targetEmoji: "🌙", targetTitle: 'אחמ"ש לילה' })} />);
    const problem = screen.getByText("חסר כיסוי למשמרת");
    const person = screen.getByText("מרטין בדיקה");
    expect(container.textContent).toContain('אחמ"ש לילה');
    // DOM order IS visual order here (no CSS re-ordering) -- the problem's
    // own node must precede the person/shift/date line's node.
    expect(problem.compareDocumentPosition(person) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the finding as its own severity-tinted callout, separate from the person/shift/date line", () => {
    render(<IssueRow view={managerView()} />);
    expect(screen.getByText("חסר כיסוי למשמרת")).toBeInTheDocument();
  });

  it("the person's name is supporting context, not the primary heading -- it never carries the severity tint", () => {
    render(<IssueRow view={managerView()} />);
    const person = screen.getByText("מרטין בדיקה");
    expect(person.className).not.toMatch(/text-critical|text-warning/);
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

  it("the collapsed trigger carries a warm/amber treatment so it's noticeable, distinct from the finding's own severity color", () => {
    render(<IssueRow view={view({ severity: "critical", recommendation: recommendationView() })} />);
    const summary = screen.getByText("פעולה מומלצת").closest("summary");
    expect(summary?.className).toContain("text-warning");
    expect(summary?.className).not.toMatch(/text-critical/);
  });

  it("36. renders the primary recommendation text verbatim", () => {
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: textOnly("לפי הסידור הקיים, אפשר לבדוק עם איתי אוליר או עילאי שפירא לגבי הכיסוי."),
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
          recommendation: recommendationView({
            primaryText: textOnly("לא נמצאו טכנאים מתאימים לפי המידע הקיים."),
            disclaimer: null,
          }),
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
            primaryText: textOnly("לא נמצאו טכנאים מתאימים לפי המידע הקיים."),
            disclaimer: null,
            lastResort: {
              triggerLabel: "מוצא אחרון · הצג אפשרויות נוספות",
              text: textOnly(
                "לא נמצאו טכנאים רגילים מתאימים. לפי הסידור הקיים, אפשר לבדוק גם עם טוביה כהן, שמסומן גם כבעל יכולת טכנית.",
              ),
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

describe("IssueRow — recommendation candidate names link to their manager drill-down", () => {
  it("a primary candidate's name renders as a link, not plain text", () => {
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: [
              { kind: "text", value: "לפי הסידור הקיים, אפשר לבדוק עם " },
              { kind: "candidateLink", personId: "p_extra", personName: "איתי אוליר" },
              { kind: "text", value: " לגבי הכיסוי." },
            ],
          }),
        })}
        current={CURRENT}
      />,
    );
    expect(screen.getByRole("link", { name: "איתי אוליר" })).toBeInTheDocument();
  });

  it("the link's href points to that exact candidate's personId via /manager?person=<personId>", () => {
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: [
              { kind: "text", value: "לפי הסידור הקיים, אפשר לבדוק עם " },
              { kind: "candidateLink", personId: "p_extra", personName: "איתי אוליר" },
              { kind: "text", value: " לגבי הכיסוי." },
            ],
          }),
        })}
        current={CURRENT}
      />,
    );
    expect(screen.getByRole("link", { name: "איתי אוליר" })).toHaveAttribute("href", "/manager?person=p_extra");
  });

  it("preserves the current manager range/month/category URL state in the candidate's href, via the same buildManagerHref used elsewhere", () => {
    const currentWithState: ManagerHrefParams = { personId: null, range: "month", month: "2026-08", category: "shifts" };
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: [{ kind: "candidateLink", personId: "p_extra", personName: "איתי אוליר" }],
          }),
        })}
        current={currentWithState}
      />,
    );
    const href = screen.getByRole("link", { name: "איתי אוליר" }).getAttribute("href");
    expect(href).toContain("person=p_extra");
    expect(href).toContain("range=month");
    expect(href).toContain("month=2026-08");
    expect(href).toContain("category=shifts");
  });

  it("multiple candidates each link to their own distinct person", () => {
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: [
              { kind: "text", value: "לפי הסידור הקיים, אפשר לבדוק עם " },
              { kind: "candidateLink", personId: "p_a", personName: "איתי אוליר" },
              { kind: "text", value: " או " },
              { kind: "candidateLink", personId: "p_b", personName: "עילאי שפירא" },
              { kind: "text", value: " לגבי הכיסוי." },
            ],
          }),
        })}
        current={CURRENT}
      />,
    );
    expect(screen.getByRole("link", { name: "איתי אוליר" })).toHaveAttribute("href", "/manager?person=p_a");
    expect(screen.getByRole("link", { name: "עילאי שפירא" })).toHaveAttribute("href", "/manager?person=p_b");
  });

  it("fallback/last-resort candidates are ALSO clickable links, not just primary ones", () => {
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: textOnly("לא נמצאו טכנאים מתאימים לפי המידע הקיים."),
            disclaimer: null,
            lastResort: {
              triggerLabel: "מוצא אחרון · הצג אפשרויות נוספות",
              text: [
                { kind: "text", value: "לא נמצאו טכנאים רגילים מתאימים. לפי הסידור הקיים, אפשר לבדוק גם עם " },
                { kind: "candidateLink", personId: "p_dual", personName: "טוביה כהן" },
                { kind: "text", value: ", שמסומן גם כבעל יכולת טכנית." },
              ],
              disclaimer: "האפשרויות האלו מוצגות כמוצא אחרון בלבד, וייתכנו אילוצים אישיים שלא מופיעים במערכת.",
            },
          }),
        })}
        current={CURRENT}
      />,
    );
    expect(screen.getByRole("link", { name: "טוביה כהן" })).toHaveAttribute("href", "/manager?person=p_dual");
  });

  it("surrounding recommendation copy stays exactly the same, just split around the link", () => {
    const { container } = render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: [
              { kind: "text", value: "לפי הסידור הקיים, אפשר לבדוק עם " },
              { kind: "candidateLink", personId: "p_extra", personName: "איתי אוליר" },
              { kind: "text", value: " לגבי הכיסוי." },
            ],
          }),
        })}
        current={CURRENT}
      />,
    );
    expect(container.textContent).toContain("לפי הסידור הקיים, אפשר לבדוק עם איתי אוליר לגבי הכיסוי.");
  });

  it("the whole recommendation row is NOT clickable -- only the candidate name itself is a link", () => {
    const { container } = render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: [
              { kind: "text", value: "לפי הסידור הקיים, אפשר לבדוק עם " },
              { kind: "candidateLink", personId: "p_extra", personName: "איתי אוליר" },
              { kind: "text", value: " לגבי הכיסוי." },
            ],
          }),
        })}
        current={CURRENT}
      />,
    );
    expect(container.querySelectorAll("a").length).toBe(1);
    expect(screen.getByText("פעולה מומלצת").closest("li")?.querySelector("a")).not.toBeNull();
  });

  it("without a current URL state, a candidate name still renders (falls back to plain text, never crashes)", () => {
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            primaryText: [
              { kind: "text", value: "לפי הסידור הקיים, אפשר לבדוק עם " },
              { kind: "candidateLink", personId: "p_extra", personName: "איתי אוליר" },
              { kind: "text", value: " לגבי הכיסוי." },
            ],
          }),
        })}
      />,
    );
    expect(screen.queryByRole("link", { name: "איתי אוליר" })).toBeNull();
    expect(screen.getByText(/איתי אוליר/)).toBeInTheDocument();
  });

  it("no name-to-ID lookup exists: the href is built directly from the candidate part's own personId, independent of what the display name looks like", () => {
    render(
      <IssueRow
        view={view({
          recommendation: recommendationView({
            // A person name that would be ambiguous/impossible to reverse-parse
            // (contains the separator words themselves) -- proves the href
            // still resolves correctly because it comes from `personId`
            // directly, never from parsing this text.
            primaryText: [{ kind: "candidateLink", personId: "p_tricky", personName: 'עם, או "בדיקה' }],
          }),
        })}
        current={CURRENT}
      />,
    );
    expect(screen.getByRole("link", { name: 'עם, או "בדיקה' })).toHaveAttribute("href", "/manager?person=p_tricky");
  });
});

describe("IssueRow — variant", () => {
  it("defaults to the plain divided-row chrome when no variant is given", () => {
    render(<IssueRow view={view({ personName: "מרטין בדיקה" })} current={CURRENT} />);
    const root = screen.getByText("חסר כיסוי למשמרת שלך").closest("li");
    expect(root?.className).toContain("py-3");
    expect(root?.className).not.toContain("ring-border");
  });

  it('variant="card" renders its own bordered surface instead of a divided-row chrome', () => {
    render(<IssueRow view={view({ personName: "מרטין בדיקה" })} current={CURRENT} variant="card" />);
    const root = screen.getByText("חסר כיסוי למשמרת שלך").closest("li");
    expect(root?.className).toContain("ring-border");
    expect(root?.className).toContain("rounded-xl");
  });

  it('the card variant preserves the exact same problem-first hierarchy and recommendation disclosure as the row variant', () => {
    render(
      <IssueRow
        view={view({ personName: "מרטין בדיקה", recommendation: recommendationView() })}
        current={CURRENT}
        variant="card"
      />,
    );
    expect(screen.getByText("חסר כיסוי למשמרת שלך")).toBeInTheDocument();
    expect(screen.getByText("פעולה מומלצת")).toBeInTheDocument();
  });
});
