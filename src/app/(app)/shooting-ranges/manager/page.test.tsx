import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Person } from "@/lib/domain/types";
import type { ShootingRangeManagerReadModel } from "@/lib/readModels/buildShootingRangeManagerReadModel";

const loadShootingRangeManagerOverview = vi.fn();
vi.mock("@/lib/readModels/shootingRangeManagerOverview", () => ({ loadShootingRangeManagerOverview }));

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => redirect(...args) }));

const { default: ShootingRangeManagerPage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  loadShootingRangeManagerOverview.mockReset();
  redirect.mockReset();
});

function manager(): Person {
  return { id: "m1", name: "מנהל בדיקה", email: "m@example.com", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null };
}

function emptyModel(): ShootingRangeManagerReadModel {
  return {
    summary: { qualifiedCount: 0, nearingExpiryCount: 0, notQualifiedCount: 0, totalCount: 0 },
    rows: [],
    pendingSelfReports: [],
    unresolvedSheetRowCount: 0,
  };
}

describe("ShootingRangeManagerPage", () => {
  it("redirects to /login when unauthenticated", async () => {
    loadShootingRangeManagerOverview.mockResolvedValue({ status: "unauthenticated" });
    render(await ShootingRangeManagerPage());
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("shows the manager-forbidden state for a non-manager", async () => {
    loadShootingRangeManagerOverview.mockResolvedValue({ status: "forbidden" });
    render(await ShootingRangeManagerPage());
    expect(screen.getByText("המסך הזה מיועד למנהלים בלבד")).toBeInTheDocument();
  });

  it("renders the summary for a manager", async () => {
    loadShootingRangeManagerOverview.mockResolvedValue({ status: "ok", manager: manager(), model: emptyModel(), avatarUrl: null });
    render(await ShootingRangeManagerPage());
    expect(screen.getByText("מטווחים -- תצוגת מנהל")).toBeInTheDocument();
    expect(screen.getByText("אין אנשים להצגה.")).toBeInTheDocument();
  });

  describe("symmetric navigation back to the personal page", () => {
    it("renders a 'לתצוגה האישית' link pointing to /shooting-ranges", async () => {
      loadShootingRangeManagerOverview.mockResolvedValue({ status: "ok", manager: manager(), model: emptyModel(), avatarUrl: null });
      render(await ShootingRangeManagerPage());
      const link = screen.getByText("לתצוגה האישית");
      expect(link).toBeInTheDocument();
      expect(link.closest("a")).toHaveAttribute("href", "/shooting-ranges");
    });

    it("never renders the back-link for a non-manager (the forbidden state has no manager content at all)", async () => {
      loadShootingRangeManagerOverview.mockResolvedValue({ status: "forbidden" });
      render(await ShootingRangeManagerPage());
      expect(screen.queryByText("לתצוגה האישית")).toBeNull();
    });
  });

  it("passes unresolvedSheetRowCount through to the panel (surfaces unmatched מטווחים sheet rows)", async () => {
    loadShootingRangeManagerOverview.mockResolvedValue({
      status: "ok",
      manager: manager(),
      model: { ...emptyModel(), unresolvedSheetRowCount: 2 },
      avatarUrl: null,
    });
    render(await ShootingRangeManagerPage());
    expect(screen.getByText(/לא שויכ/)).toBeInTheDocument();
  });
});
