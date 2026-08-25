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
    summary: { qualifiedCount: 0, nearingExpiryCount: 0, notQualifiedCount: 0, notRelevantCount: 0, totalCount: 0 },
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
    avatarUrl: null,
    roleGroup: "technician",
    status: "valid",
    baselineDate: "2026-06-01",
    expiryDate: "2026-12-01",
    notRelevantReason: null,
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
        model: { ...emptyModel(), rows: [supervisor, technician], summary: { qualifiedCount: 2, nearingExpiryCount: 0, notQualifiedCount: 0, notRelevantCount: 0, totalCount: 2 } },
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
        model: { ...emptyModel(), rows: [technician], summary: { qualifiedCount: 1, nearingExpiryCount: 0, notQualifiedCount: 0, notRelevantCount: 0, totalCount: 1 } },
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
          summary: { qualifiedCount: 2, nearingExpiryCount: 0, notQualifiedCount: 1, notRelevantCount: 0, totalCount: 3 },
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

  describe("Google profile photo avatars", () => {
    it("renders the connected person's Google photo when avatarUrl is present", async () => {
      const withPhoto = row({ personId: "p1", personName: "בעל תמונה", avatarUrl: "https://example.invalid/photo.jpg" });
      loadShootingRangeManagerOverview.mockResolvedValue({
        status: "ok",
        manager: manager(),
        model: {
          ...emptyModel(),
          rows: [withPhoto],
          summary: { qualifiedCount: 1, nearingExpiryCount: 0, notQualifiedCount: 0, notRelevantCount: 0, totalCount: 1 },
        },
        avatarUrl: null,
      });
      render(await ShootingRangeManagerPage());

      expect(screen.getByTestId("avatar-photo")).toHaveAttribute("src", "https://example.invalid/photo.jpg");
    });

    it("falls back to initials when avatarUrl is null (no connected account, or no usable photo)", async () => {
      const noPhoto = row({ personId: "p1", personName: "ללא תמונה", avatarUrl: null });
      loadShootingRangeManagerOverview.mockResolvedValue({
        status: "ok",
        manager: manager(),
        model: {
          ...emptyModel(),
          rows: [noPhoto],
          summary: { qualifiedCount: 1, nearingExpiryCount: 0, notQualifiedCount: 0, notRelevantCount: 0, totalCount: 1 },
        },
        avatarUrl: null,
      });
      render(await ShootingRangeManagerPage());

      expect(screen.queryByTestId("avatar-photo")).toBeNull();
    });
  });

  describe("לא רלוונטי rows in the team list", () => {
    it("shows the distinct לא רלוונטי badge and reason, never a baseline/expiry date line", async () => {
      const notRelevant = row({
        personId: "p1",
        personName: "לא רלוונטי בדיקה",
        status: "not_relevant",
        notRelevantReason: "פטור שמירות",
        baselineDate: null,
        expiryDate: null,
      });
      loadShootingRangeManagerOverview.mockResolvedValue({
        status: "ok",
        manager: manager(),
        model: {
          ...emptyModel(),
          rows: [notRelevant],
          summary: { qualifiedCount: 0, nearingExpiryCount: 0, notQualifiedCount: 0, notRelevantCount: 1, totalCount: 1 },
        },
        avatarUrl: null,
      });
      render(await ShootingRangeManagerPage());

      expect(screen.getByText("לא רלוונטי")).toBeInTheDocument();
      expect(screen.getByText("פטור שמירות")).toBeInTheDocument();
      expect(screen.queryByText(/אחרון:/)).toBeNull();
      expect(screen.queryByText(/תוקף:/)).toBeNull();
      expect(screen.queryByText("אין נתונים")).toBeNull();
    });

    it("a לא רלוונטי person is excluded from the 'דורשי טיפול' filter", async () => {
      const notRelevant = row({ personId: "p1", personName: "לא רלוונטי בדיקה", status: "not_relevant", requiresAttention: false });
      loadShootingRangeManagerOverview.mockResolvedValue({
        status: "ok",
        manager: manager(),
        model: {
          ...emptyModel(),
          rows: [notRelevant],
          summary: { qualifiedCount: 0, nearingExpiryCount: 0, notQualifiedCount: 0, notRelevantCount: 1, totalCount: 1 },
        },
        avatarUrl: null,
      });
      render(await ShootingRangeManagerPage());

      fireEvent.click(screen.getByLabelText("הצג רק דורשי טיפול"));
      expect(screen.queryByText("לא רלוונטי בדיקה")).toBeNull();
    });

    it("renders a separate לא רלוונטיים summary tile only when there's at least one, never silently folded into כשירים/לא כשירים", async () => {
      loadShootingRangeManagerOverview.mockResolvedValue({
        status: "ok",
        manager: manager(),
        model: {
          ...emptyModel(),
          summary: { qualifiedCount: 0, nearingExpiryCount: 0, notQualifiedCount: 0, notRelevantCount: 3, totalCount: 3 },
        },
        avatarUrl: null,
      });
      render(await ShootingRangeManagerPage());

      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("לא רלוונטיים")).toBeInTheDocument();
    });

    it("never renders the לא רלוונטיים tile when the count is 0", async () => {
      loadShootingRangeManagerOverview.mockResolvedValue({ status: "ok", manager: manager(), model: emptyModel(), avatarUrl: null });
      render(await ShootingRangeManagerPage());

      expect(screen.queryByText("לא רלוונטיים")).toBeNull();
    });

    it("excludes a לא רלוונטי person from the 'שיבוץ מטווח חדש' picker roster -- they can no longer be scheduled server-side either", async () => {
      const eligible = row({ personId: "p1", personName: "כשיר בדיקה", status: "valid" });
      const notRelevant = row({ personId: "p2", personName: "לא רלוונטי בדיקה", status: "not_relevant" });
      loadShootingRangeManagerOverview.mockResolvedValue({
        status: "ok",
        manager: manager(),
        model: {
          ...emptyModel(),
          rows: [eligible, notRelevant],
          summary: { qualifiedCount: 1, nearingExpiryCount: 0, notQualifiedCount: 0, notRelevantCount: 1, totalCount: 2 },
        },
        avatarUrl: null,
      });
      render(await ShootingRangeManagerPage());

      fireEvent.click(screen.getByText("שיבוץ מטווח חדש"));

      // Both names also render in the team list above, so scope the check to
      // the picker's own checkbox labels rather than the whole document.
      const pickerLabels = screen.getAllByRole("checkbox").map((checkbox) => checkbox.closest("label")?.textContent);
      expect(pickerLabels).toContain("כשיר בדיקה");
      expect(pickerLabels).not.toContain("לא רלוונטי בדיקה");
    });
  });

  describe("mobile-responsive team row layout", () => {
    async function renderRow(overrides: Partial<ManagerShootingRangeRow> = {}) {
      loadShootingRangeManagerOverview.mockResolvedValue({
        status: "ok",
        manager: manager(),
        model: {
          ...emptyModel(),
          rows: [row(overrides)],
          summary: { qualifiedCount: 1, nearingExpiryCount: 0, notQualifiedCount: 0, notRelevantCount: 0, totalCount: 1 },
        },
        avatarUrl: null,
      });
      return render(await ShootingRangeManagerPage());
    }

    it("stacks the row into separate lines on mobile (flex-col) and reflows to a single line on desktop (sm:flex-row) -- never a fixed one-line-only layout", async () => {
      const { container } = await renderRow();
      const li = container.querySelector("li");
      expect(li?.className).toMatch(/\bflex-col\b/);
      expect(li?.className).toMatch(/\bsm:flex-row\b/);
    });

    it("groups avatar+name as their own unit -- a mobile-only wrapper that dissolves at sm: via display:contents, so desktop stays the same flat single-row flex layout as before", async () => {
      await renderRow({ personName: "שם לבדיקת שורה" });
      const nameEl = screen.getByText("שם לבדיקת שורה");
      const wrapper = nameEl.parentElement;
      expect(wrapper?.className).toMatch(/\bsm:contents\b/);
      // The avatar sits in the SAME wrapper as the name, not as a separate top-level row item.
      expect(wrapper?.children.length).toBe(2);
    });

    it("groups the baseline/expiry metadata into its own wrapper that stacks on mobile and dissolves into the flat row on desktop", async () => {
      await renderRow({ baselineDate: "2026-06-01", expiryDate: "2026-12-01" });
      const baselineEl = screen.getByText(/אחרון:/);
      const expiryEl = screen.getByText(/תוקף:/);
      expect(baselineEl.parentElement).toBe(expiryEl.parentElement);
      expect(baselineEl.parentElement?.className).toMatch(/\bsm:contents\b/);
    });

    it("groups planned-range/pending-report badges so they wrap cleanly on mobile instead of forcing the row wider", async () => {
      await renderRow({
        plannedRange: { rangeDate: "2026-09-03", status: "planned" },
        hasPendingSelfReport: true,
      });
      const plannedBadge = screen.getByText(/🎯/);
      const pendingBadge = screen.getByText("דיווח ממתין");
      expect(plannedBadge.parentElement).toBe(pendingBadge.parentElement);
      expect(plannedBadge.parentElement?.className).toMatch(/flex-wrap/);
      expect(plannedBadge.parentElement?.className).toMatch(/\bsm:contents\b/);
    });

    it("renders a לא רלוונטי reason as a standalone element, not grouped inside the metadata wrapper (so it lands clearly on its own line)", async () => {
      await renderRow({ status: "not_relevant", notRelevantReason: "פטור שמירות" });
      const reasonEl = screen.getByText("פטור שמירות");
      expect(reasonEl.tagName).toBe("SPAN");
      expect(reasonEl.parentElement?.tagName).toBe("LI");
    });
  });

  describe("the 'הצג רק דורשי טיפול' toggle row stays wrap-safe at narrow widths", () => {
    it("allows the header row to wrap rather than forcing the heading and the filter label onto one unbreakable line", async () => {
      loadShootingRangeManagerOverview.mockResolvedValue({ status: "ok", manager: manager(), model: emptyModel(), avatarUrl: null });
      render(await ShootingRangeManagerPage());

      const heading = screen.getByText("אנשי צוות");
      const headerRow = heading.parentElement;
      expect(headerRow?.className).toMatch(/flex-wrap/);
    });
  });
});
