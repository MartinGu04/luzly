import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { RecentDashboardChange } from "@/lib/readModels/recentDashboardChangesTypes";
import { RecentChangesPanel } from "./RecentChangesPanel";

afterEach(() => {
  cleanup();
});

const NOW = new Date("2026-08-16T12:00:00.000Z");

function change(overrides: Partial<RecentDashboardChange> = {}): RecentDashboardChange {
  return {
    key: "change:job_1",
    category: "shift",
    title: "⚠️ שינוי בשיבוץ",
    body: "השיבוץ שלך ליום חמישי השתנה: יום → לילה",
    happenedAt: "2026-08-16T11:42:00.000Z",
    href: "/schedule?date=2026-08-19",
    date: "2026-08-19",
    ...overrides,
  };
}

describe("RecentChangesPanel -- 11. zero changes", () => {
  it("renders nothing at all, not even an empty container", () => {
    const { container } = render(<RecentChangesPanel changes={[]} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RecentChangesPanel -- 12. one change", () => {
  it("renders the heading and the item's body", () => {
    render(<RecentChangesPanel changes={[change()]} now={NOW} />);
    expect(screen.getByRole("heading", { name: "מה השתנה" })).toBeInTheDocument();
    expect(screen.getByText("השיבוץ שלך ליום חמישי השתנה: יום → לילה")).toBeInTheDocument();
  });

  it("never renders the generic title text visibly next to the body (kept sr-only instead)", () => {
    render(<RecentChangesPanel changes={[change()]} now={NOW} />);
    const title = screen.getByText("⚠️ שינוי בשיבוץ");
    expect(title).toHaveClass("sr-only");
  });
});

describe("RecentChangesPanel -- 13. multiple changes ordered correctly", () => {
  it("renders rows in the exact order given, never re-sorted", () => {
    render(
      <RecentChangesPanel
        changes={[
          change({ key: "a", body: "שינוי ראשון" }),
          change({ key: "b", body: "שינוי שני" }),
          change({ key: "c", body: "שינוי שלישי" }),
        ]}
        now={NOW}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("שינוי ראשון"),
      expect.stringContaining("שינוי שני"),
      expect.stringContaining("שינוי שלישי"),
    ]);
  });
});

describe("RecentChangesPanel -- 14. relative timestamp", () => {
  it("renders the change's relative time computed against the given now", () => {
    render(<RecentChangesPanel changes={[change({ happenedAt: "2026-08-16T11:42:00.000Z" })]} now={NOW} />);
    expect(screen.getByText("לפני 18 דקות")).toBeInTheDocument();
  });
});

describe("RecentChangesPanel -- 15. category visual distinction without alarm overload", () => {
  it("shows the shift-change emoji cue", () => {
    render(<RecentChangesPanel changes={[change({ category: "shift" })]} now={NOW} />);
    expect(screen.getByText("⚠️")).toBeInTheDocument();
  });

  it("shows the team-change emoji cue", () => {
    render(<RecentChangesPanel changes={[change({ category: "team" })]} now={NOW} />);
    expect(screen.getByText("👥")).toBeInTheDocument();
  });

  it("shows the duty-change emoji cue", () => {
    render(<RecentChangesPanel changes={[change({ category: "duty" })]} now={NOW} />);
    expect(screen.getByText("🔄")).toBeInTheDocument();
  });

  it("never applies a critical/error-severity treatment to an ordinary shift change", () => {
    const { container } = render(<RecentChangesPanel changes={[change({ category: "shift" })]} now={NOW} />);
    expect(container.querySelector('[class*="critical"]')).toBeNull();
    expect(container.querySelector('[class*="danger"]')).toBeNull();
  });
});

describe("RecentChangesPanel -- 16. actionable item navigation", () => {
  it("the entire row is a link to the change's href", () => {
    render(<RecentChangesPanel changes={[change({ href: "/schedule?date=2026-08-19" })]} now={NOW} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/schedule?date=2026-08-19");
  });

  it("a duty change links to /duties", () => {
    render(<RecentChangesPanel changes={[change({ category: "duty", href: "/duties" })]} now={NOW} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/duties");
  });
});

describe("RecentChangesPanel -- 17. long copy on mobile", () => {
  it("renders the full body text without truncating it (wraps instead)", () => {
    const longBody =
      "השיבוץ שלך ליום חמישי השתנה מיום למשמרת לילה, ותפקידך במשמרת גם הוא השתנה בהתאם לעדכון האחרון שהתקבל מהמערכת";
    render(<RecentChangesPanel changes={[change({ body: longBody })]} now={NOW} />);
    const bodyEl = screen.getByText(longBody);
    expect(bodyEl.textContent).toBe(longBody);
    expect(bodyEl.className).not.toMatch(/truncate/);
  });
});
