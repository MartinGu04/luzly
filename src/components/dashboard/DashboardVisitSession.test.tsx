import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DashboardVisitRecap } from "@/lib/readModels/recentDashboardChangesTypes";
import { DashboardVisitSession } from "./DashboardVisitSession";

const recordDashboardVisitAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/dashboardVisit/actions", () => ({ recordDashboardVisitAction }));

beforeEach(() => {
  recordDashboardVisitAction.mockReset();
  recordDashboardVisitAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
});

function change(overrides: Partial<DashboardVisitRecap["items"][number]> = {}): DashboardVisitRecap["items"][number] {
  return {
    key: "change:job_1",
    category: "shift",
    title: "⚠️ שינוי בשיבוץ",
    body: "השיבוץ שלך ליום חמישי השתנה: יום → לילה",
    happenedAt: "2026-08-25T09:30:00.000Z",
    href: "/schedule?date=2026-08-25",
    date: "2026-08-25",
    ...overrides,
  };
}

const ORIGINAL_RECAP: DashboardVisitRecap = {
  visitStartedAt: "2026-08-25T10:00:00.000Z",
  totalCount: 3,
  items: [
    change({ key: "a", body: "שינוי א" }),
    change({ key: "b", body: "שינוי ב" }),
    change({ key: "c", body: "שינוי ג" }),
  ],
};

describe("DashboardVisitSession -- the AppRevalidator same-visit correctness bug", () => {
  it("initial mount renders the recap and marks the visit once", async () => {
    render(<DashboardVisitSession visitRecap={ORIGINAL_RECAP} />);
    await Promise.resolve();

    expect(screen.getByText("שינוי א")).toBeInTheDocument();
    expect(screen.getByText("שינוי ב")).toBeInTheDocument();
    expect(screen.getByText("שינוי ג")).toBeInTheDocument();
    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);
    expect(recordDashboardVisitAction).toHaveBeenCalledWith("2026-08-25T10:00:00.000Z");
  });

  it("a Server Component prop refresh on the SAME mounted instance (simulating AppRevalidator's router.refresh()) does NOT replace/empty the displayed recap, and does NOT re-mark the visit", async () => {
    const { rerender } = render(<DashboardVisitSession visitRecap={ORIGINAL_RECAP} />);
    await Promise.resolve();
    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);

    // A fresh server render now reads last_visited_at = 10:00 (this
    // visit's own already-persisted marker write) and returns an EMPTY
    // recap -- exactly the bug scenario: without freezing, this would
    // wipe the panel the user is still looking at.
    const refreshedEmptyRecap: DashboardVisitRecap = {
      visitStartedAt: "2026-08-25T10:05:00.000Z",
      totalCount: 0,
      items: [],
    };
    rerender(<DashboardVisitSession visitRecap={refreshedEmptyRecap} />);
    await Promise.resolve();

    // The ORIGINAL recap is still rendered, untouched.
    expect(screen.getByText("שינוי א")).toBeInTheDocument();
    expect(screen.getByText("שינוי ב")).toBeInTheDocument();
    expect(screen.getByText("שינוי ג")).toBeInTheDocument();
    expect(screen.getByText("מה השתנה מאז הפעם הקודמת")).toBeInTheDocument();

    // No second marker write, and still the ORIGINAL mount-time instant.
    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);
    expect(recordDashboardVisitAction).toHaveBeenCalledWith("2026-08-25T10:00:00.000Z");
  });

  it("a refresh carrying DIFFERENT (non-empty) changes also does not replace the original recap", async () => {
    const { rerender } = render(<DashboardVisitSession visitRecap={ORIGINAL_RECAP} />);
    await Promise.resolve();

    const refreshedDifferentRecap: DashboardVisitRecap = {
      visitStartedAt: "2026-08-25T10:05:00.000Z",
      totalCount: 1,
      items: [change({ key: "z", body: "שינוי חדש שהתרחש אחרי הרענון" })],
    };
    rerender(<DashboardVisitSession visitRecap={refreshedDifferentRecap} />);
    await Promise.resolve();

    expect(screen.getByText("שינוי א")).toBeInTheDocument();
    expect(screen.queryByText("שינוי חדש שהתרחש אחרי הרענון")).toBeNull();
    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);
  });

  it("a genuine unmount + remount (leaving Home and returning) DOES adopt the new recap and marks a new visit", async () => {
    const first = render(<DashboardVisitSession visitRecap={ORIGINAL_RECAP} />);
    await Promise.resolve();
    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);

    first.unmount();

    const newVisitRecap: DashboardVisitRecap = {
      visitStartedAt: "2026-08-25T11:00:00.000Z",
      totalCount: 1,
      items: [change({ key: "new", body: "שינוי מהביקור החדש" })],
    };
    render(<DashboardVisitSession visitRecap={newVisitRecap} />);
    await Promise.resolve();

    expect(screen.getByText("שינוי מהביקור החדש")).toBeInTheDocument();
    expect(screen.queryByText("שינוי א")).toBeNull();
    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(2);
    expect(recordDashboardVisitAction).toHaveBeenLastCalledWith("2026-08-25T11:00:00.000Z");
  });
});

describe("DashboardVisitSession -- empty recap stays frozen too", () => {
  it("a mount with zero items renders no panel, and a later refresh with items still renders nothing (frozen empty snapshot)", async () => {
    const emptyRecap: DashboardVisitRecap = { visitStartedAt: "2026-08-25T10:00:00.000Z", totalCount: 0, items: [] };
    const { rerender } = render(<DashboardVisitSession visitRecap={emptyRecap} />);
    await Promise.resolve();
    expect(screen.queryByText("מה השתנה מאז הפעם הקודמת")).toBeNull();

    rerender(<DashboardVisitSession visitRecap={ORIGINAL_RECAP} />);
    await Promise.resolve();

    expect(screen.queryByText("מה השתנה מאז הפעם הקודמת")).toBeNull();
    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);
    expect(recordDashboardVisitAction).toHaveBeenCalledWith("2026-08-25T10:00:00.000Z");
  });
});
