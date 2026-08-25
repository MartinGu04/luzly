import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Person } from "@/lib/domain/types";
import type { ManagerShootingRangeRow, ShootingRangeManagerReadModel } from "@/lib/readModels/buildShootingRangeManagerReadModel";

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
    unresolvedSheetRowNames: [],
  };
}

function row(overrides: Partial<ManagerShootingRangeRow> = {}): ManagerShootingRangeRow {
  return {
    personId: "p1",
    personName: "אדם בדיקה",
    roleGroup: "technician",
    status: "valid",
    baselineDate: "2026-06-01",
    expiryDate: "2026-12-01",
    plannedRange: null,
    hasPendingSelfReport: false,
    requiresAttention: false,
    ...overrides,
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

  describe("grouping the team list by role (אחמ״שים / טכנאים)", () => {
    it("renders eligible people under their own role section, without duplicating anyone", async () => {
      const supervisor = row({ personId: "sup1", personName: "מפקדת בדיקה", roleGroup: "supervisor" });
      const technician = row({ personId: "tech1", personName: "טכנאי בדיקה", roleGroup: "technician" });
      loadShootingRangeManagerOverview.mockResolvedValue({
        status: "ok",
        manager: manager(),
        model: { ...emptyModel(), rows: [supervisor, technician], summary: { qualifiedCount: 2, nearingExpiryCount: 0, notQualifiedCount: 0, totalCount: 2 } },
        avatarUrl: null,
      });
      render(await ShootingRangeManagerPage());

      expect(screen.getByText("אחמ״שים")).toBeInTheDocument();
      expect(screen.getByText("טכנאים")).toBeInTheDocument();
      expect(screen.getAllByText("מפקדת בדיקה")).toHaveLength(1);
      expect(screen.getAllByText("טכנאי בדיקה")).toHaveLength(1);
    });

    it("never renders a role-section heading when that group has no eligible people", async () => {
      const technician = row({ personId: "tech1", personName: "טכנאי בדיקה", roleGroup: "technician" });
      loadShootingRangeManagerOverview.mockResolvedValue({
        status: "ok",
        manager: manager(),
        model: { ...emptyModel(), rows: [technician], summary: { qualifiedCount: 1, nearingExpiryCount: 0, notQualifiedCount: 0, totalCount: 1 } },
        avatarUrl: null,
      });
      render(await ShootingRangeManagerPage());

      expect(screen.queryByText("אחמ״שים")).toBeNull();
      expect(screen.getByText("טכנאים")).toBeInTheDocument();
    });

    it("keeps the requires-attention filter working within each role group", async () => {
      const okSupervisor = row({ personId: "sup1", personName: "מפקדת תקינה", roleGroup: "supervisor", requiresAttention: false });
      const attentionSupervisor = row({ personId: "sup2", personName: "מפקדת דורשת טיפול", roleGroup: "supervisor", requiresAttention: true, status: "expired" });
      const okTechnician = row({ personId: "tech1", personName: "טכנאי תקין", roleGroup: "technician", requiresAttention: false });
      loadShootingRangeManagerOverview.mockResolvedValue({
        status: "ok",
        manager: manager(),
        model: {
          ...emptyModel(),
          rows: [okSupervisor, attentionSupervisor, okTechnician],
          summary: { qualifiedCount: 2, nearingExpiryCount: 0, notQualifiedCount: 1, totalCount: 3 },
        },
        avatarUrl: null,
      });
      render(await ShootingRangeManagerPage());

      fireEvent.click(screen.getByLabelText("הצג רק דורשי טיפול"));

      expect(screen.getByText("מפקדת דורשת טיפול")).toBeInTheDocument();
      expect(screen.queryByText("מפקדת תקינה")).toBeNull();
      expect(screen.queryByText("טכנאי תקין")).toBeNull();
      expect(screen.queryByText("טכנאים")).toBeNull();
    });
  });
});
