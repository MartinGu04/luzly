import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ManagerShootingRangeRow, ManagerShootingRangeSummary } from "@/lib/readModels/buildShootingRangeManagerReadModel";

vi.mock("@/lib/shootingRanges/actions", () => ({
  approveSelfReportShootingRangeAction: vi.fn(),
  confirmPlannedShootingRangeAction: vi.fn(),
  createPlannedShootingRangeAction: vi.fn(),
  rejectSelfReportShootingRangeAction: vi.fn(),
}));

const { ShootingRangeManagerPanel } = await import("./ShootingRangeManagerPanel");

const SUMMARY: ManagerShootingRangeSummary = {
  qualifiedCount: 0,
  nearingExpiryCount: 0,
  notQualifiedCount: 0,
  notRelevantCount: 0,
  totalCount: 0,
};

function row(overrides: Partial<ManagerShootingRangeRow> = {}): ManagerShootingRangeRow {
  return {
    personId: "p1",
    personName: "בדיקה",
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

afterEach(() => {
  cleanup();
});

describe("ShootingRangeManagerPanel -- personnel grouping", () => {
  it("renders a permanent (קבע) person under the 'קבע' group, never under אחמ״שים/טכנאים", () => {
    const rows = [
      row({ personId: "p_perm", personName: "קבע בדיקה", roleGroup: "permanent" }),
      row({ personId: "p_sup", personName: "אחמש בדיקה", roleGroup: "supervisor" }),
      row({ personId: "p_tech", personName: "טכנאי בדיקה", roleGroup: "technician" }),
    ];

    render(
      <ShootingRangeManagerPanel
        summary={{ ...SUMMARY, totalCount: 3 }}
        rows={rows}
        pendingSelfReports={[]}
        roster={[]}
        unresolvedSheetRowCount={0}
        unresolvedSheetRowNames={[]}
      />,
    );

    const permanentHeading = screen.getByRole("heading", { name: "קבע" });
    const supervisorHeading = screen.getByRole("heading", { name: "אחמ״שים" });
    const technicianHeading = screen.getByRole("heading", { name: "טכנאים" });

    // "קבע בדיקה" appears under the "קבע" group section, not under אחמ״שים/טכנאים.
    const permanentSection = permanentHeading.parentElement as HTMLElement;
    const supervisorSection = supervisorHeading.parentElement as HTMLElement;
    const technicianSection = technicianHeading.parentElement as HTMLElement;

    expect(within(permanentSection).getByText("קבע בדיקה")).toBeInTheDocument();
    expect(within(supervisorSection).queryByText("קבע בדיקה")).not.toBeInTheDocument();
    expect(within(technicianSection).queryByText("קבע בדיקה")).not.toBeInTheDocument();

    expect(within(supervisorSection).getByText("אחמש בדיקה")).toBeInTheDocument();
    expect(within(technicianSection).getByText("טכנאי בדיקה")).toBeInTheDocument();
  });

  it("the 'קבע' group renders ABOVE אחמ״שים/טכנאים in document order", () => {
    const rows = [
      row({ personId: "p_perm", personName: "קבע בדיקה", roleGroup: "permanent" }),
      row({ personId: "p_sup", personName: "אחמש בדיקה", roleGroup: "supervisor" }),
      row({ personId: "p_tech", personName: "טכנאי בדיקה", roleGroup: "technician" }),
    ];

    render(
      <ShootingRangeManagerPanel
        summary={{ ...SUMMARY, totalCount: 3 }}
        rows={rows}
        pendingSelfReports={[]}
        roster={[]}
        unresolvedSheetRowCount={0}
        unresolvedSheetRowNames={[]}
      />,
    );

    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["קבע", "אחמ״שים", "טכנאים"]);
  });

  it("never renders the 'קבע' group heading when there are no permanent staff -- same as the existing empty-group behavior", () => {
    const rows = [row({ personId: "p_tech", personName: "טכנאי בדיקה", roleGroup: "technician" })];

    render(
      <ShootingRangeManagerPanel
        summary={{ ...SUMMARY, totalCount: 1 }}
        rows={rows}
        pendingSelfReports={[]}
        roster={[]}
        unresolvedSheetRowCount={0}
        unresolvedSheetRowNames={[]}
      />,
    );

    expect(screen.queryByRole("heading", { name: "קבע" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "טכנאים" })).toBeInTheDocument();
  });
});
