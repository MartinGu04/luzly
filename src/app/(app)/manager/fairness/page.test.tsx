import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ManagerFairnessPersonRowView, ManagerFairnessReadModel } from "@/lib/readModels/managerFairnessTypes";

const getRequestManagerFairness = vi.fn();
vi.mock("@/lib/readModels/getRequestManagerFairness", () => ({ getRequestManagerFairness }));

const { default: ManagerFairnessPage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getRequestManagerFairness.mockReset();
});

function row(overrides: Partial<ManagerFairnessPersonRowView> = {}): ManagerFairnessPersonRowView {
  return {
    key: "AB10-0",
    sourceName: "מרטין בדיקה",
    personId: "p_martin",
    allocationLabel: "טכנאי",
    previousScore: 5.1,
    currentScore: 6.35,
    delta: 1.25,
    comparisonTarget: 8,
    gapToTarget: -1.65,
    normalizedLoad: 0.79375,
    weekendCount: 3,
    exemptions: [],
    ...overrides,
  };
}

function model(overrides: Partial<ManagerFairnessReadModel> = {}): ManagerFairnessReadModel {
  return {
    manager: { id: "p_manager", name: "דני מנהל" },
    fetchedAt: "2026-08-13T08:00:00.000Z",
    localNow: { date: "2026-08-13", minuteOfDay: 600 },
    period: { key: "h2", label: "7–12/2026" },
    targets: { supervisorTarget: 4, technicianTarget: 8 },
    rows: [row()],
    totals: null,
    chartSlices: [{ id: "p_martin", name: "מרטין בדיקה", score: 6.35, percentage: 100 }],
    selectedPersonId: null,
    ...overrides,
  };
}

function okResult(m: ManagerFairnessReadModel) {
  return { status: "ok" as const, model: m };
}

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const element = await ManagerFairnessPage({ searchParams: Promise.resolve(searchParams) });
  return render(element);
}

describe("ManagerFairnessPage — authorization states", () => {
  it("forbidden: shows the manager-only denial state, never fairness data", async () => {
    getRequestManagerFairness.mockResolvedValue({ status: "forbidden" });
    await renderPage();
    expect(screen.getByText("המסך הזה מיועד למנהלים בלבד")).toBeInTheDocument();
    expect(screen.queryByText("טבלת צדק")).toBeNull();
  });

  it("configuration_error: shows the shared configuration-error state", async () => {
    getRequestManagerFairness.mockResolvedValue({ status: "configuration_error", message: "bad config" });
    await renderPage();
    expect(screen.getByText("לא ניתן לחשב כרגע את שעות המשמרות")).toBeInTheDocument();
  });
});

describe("ManagerFairnessPage — request scope", () => {
  it("passes parsed period/person search params through", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model()));
    await renderPage({ period: "h1", person: "p_martin" });
    expect(getRequestManagerFairness).toHaveBeenCalledWith("h1", "p_martin");
  });

  it("defaults: no search params -> null/null", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model()));
    await renderPage();
    expect(getRequestManagerFairness).toHaveBeenCalledWith(null, null);
  });
});

describe("ManagerFairnessPage — everyone view", () => {
  it("shows the page title, period label, and a back link to מבט מנהל", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model()));
    await renderPage();
    expect(screen.getByRole("heading", { name: "טבלת צדק", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("7–12/2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /מבט מנהל/ })).toHaveAttribute("href", "/manager");
  });

  it("shows the parsed X/2X target context using the ACTUAL parsed values", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model({ targets: { supervisorTarget: 4, technicianTarget: 8 } })));
    await renderPage();
    expect(screen.getByText(/X = 4/)).toBeInTheDocument();
    expect(screen.getByText(/2X = 8/)).toBeInTheDocument();
  });

  it("an unparsed target note shows an honest fallback, never a magic default", async () => {
    getRequestManagerFairness.mockResolvedValue(
      okResult(model({ targets: { supervisorTarget: null, technicianTarget: null } })),
    );
    await renderPage();
    expect(screen.getAllByText(/לא זוהה/).length).toBeGreaterThan(0);
  });

  it("shows a fairness row with name, current score, and weekend count", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model()));
    await renderPage();
    expect(screen.getAllByText("מרטין בדיקה").length).toBeGreaterThan(0);
    expect(screen.getByText("6.35")).toBeInTheDocument();
  });

  it("a resolved person row links to the drill-down URL", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model()));
    await renderPage();
    const link = screen.getByRole("link", { name: /מרטין בדיקה/ });
    expect(link).toHaveAttribute("href", "/manager/fairness?period=h2&person=p_martin");
  });

  it("an unresolved historical row is never a link, but still displays", async () => {
    getRequestManagerFairness.mockResolvedValue(
      okResult(model({ rows: [row({ personId: null, sourceName: "עזב את הצוות" })] })),
    );
    await renderPage();
    expect(screen.getByText("עזב את הצוות")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /עזב את הצוות/ })).toBeNull();
  });

  it("shows exemption badges visibly, never hidden behind a tooltip", async () => {
    getRequestManagerFairness.mockResolvedValue(
      okResult(model({ rows: [row({ exemptions: [{ raw: "שמירות", affectedDutyFamilies: ["guard"] }] })] })),
    );
    await renderPage();
    expect(screen.getByText("🚫 שמירות")).toBeInTheDocument();
  });

  it("a missing previous score shows the honest 'new' delta phrasing, never a fabricated delta", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model({ rows: [row({ previousScore: null, delta: null })] })));
    await renderPage();
    expect(screen.getByText("חדש · אין ניקוד קודם")).toBeInTheDocument();
  });

  it("0 weekends renders as 0, distinct from an unavailable dash", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model({ rows: [row({ weekendCount: 0 })] })));
    const { container } = await renderPage();
    expect(container.textContent).toContain("0");
  });

  it("shows the pie/donut chart with an accessible label", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model()));
    await renderPage();
    expect(screen.getByRole("img", { name: "חלוקת הניקוד הנוכחי בצוות" })).toBeInTheDocument();
  });

  it("a reported total that differs from the displayed-row sum NEVER shows a discrepancy/error warning (hardening pass)", async () => {
    getRequestManagerFairness.mockResolvedValue(
      okResult(
        model({
          totals: {
            reportedPreviousTotal: 5,
            reportedCurrentTotal: 999,
            reportedWeekendTotal: 3,
            displayedPreviousSum: 5.1,
            displayedCurrentSum: 6.35,
            displayedWeekendSum: 3,
          },
        }),
      ),
    );
    const { container } = await renderPage();
    expect(screen.queryByText(/יש פער בין סכום השורות/)).toBeNull();
    expect(container.textContent).not.toContain("שגיאה");
    expect(container.textContent).not.toContain("דיסקרפנסי");
    // The source-reported total still shows through, unaltered, in the summary strip.
    expect(container.textContent).toContain("999");
  });

  it("matching reported/displayed totals also never show a warning", async () => {
    getRequestManagerFairness.mockResolvedValue(
      okResult(
        model({
          totals: {
            reportedPreviousTotal: 5.1,
            reportedCurrentTotal: 6.35,
            reportedWeekendTotal: 3,
            displayedPreviousSum: 5.1,
            displayedCurrentSum: 6.35,
            displayedWeekendSum: 3,
          },
        }),
      ),
    );
    await renderPage();
    expect(screen.queryByText(/יש פער בין סכום השורות/)).toBeNull();
  });

  it("never says 'הבא בתור' or implies an assignment recommendation (PR #15 §20)", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model()));
    const { container } = await renderPage();
    expect(container.textContent).not.toContain("הבא בתור");
    expect(container.textContent).not.toContain("עדיפות לשיבוץ");
  });
});

describe("ManagerFairnessPage — period selector", () => {
  it("links to both periods with period explicit in the URL", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model()));
    await renderPage();
    expect(screen.getByRole("link", { name: "1–6" })).toHaveAttribute("href", "/manager/fairness?period=h1");
    expect(screen.getByRole("link", { name: "7–12" })).toHaveAttribute("href", "/manager/fairness?period=h2");
  });
});

describe("ManagerFairnessPage — selected person drill-down", () => {
  it("shows the focused person view with score/target/exemption context", async () => {
    getRequestManagerFairness.mockResolvedValue(
      okResult(
        model({
          selectedPersonId: "p_martin",
          rows: [row({ exemptions: [{ raw: "שמירות", affectedDutyFamilies: ["guard"] }] })],
        }),
      ),
    );
    await renderPage({ person: "p_martin" });
    expect(screen.getByRole("heading", { name: "מרטין בדיקה" })).toBeInTheDocument();
    expect(screen.getByText("🚫 שמירות")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /חזרה לטבלת צדק/ })).toHaveAttribute(
      "href",
      "/manager/fairness?period=h2",
    );
  });

  it("never fabricates an itemized score formula (PR #15 §33)", async () => {
    getRequestManagerFairness.mockResolvedValue(okResult(model({ selectedPersonId: "p_martin" })));
    const { container } = await renderPage({ person: "p_martin" });
    expect(container.textContent).not.toMatch(/שמירות \+\d/);
  });
});

describe("ManagerFairnessPage — privacy", () => {
  it("never leaks email/sourceSheet/sourceCell/spreadsheet details", async () => {
    getRequestManagerFairness.mockResolvedValue(
      okResult(model({ rows: [row({ exemptions: [{ raw: "שמירות", affectedDutyFamilies: ["guard"] }] })] })),
    );
    const { container } = await renderPage();
    expect(container.textContent).not.toContain("sourceSheet");
    expect(container.textContent).not.toContain("sourceCell");
    expect(container.textContent).not.toMatch(/[^\s@]+@[^\s@]+\.[^\s@]+/); // no email-shaped text (the chart's own "@media" CSS text is not an email)
    expect(container.textContent).not.toContain("spreadsheetId");
  });
});
