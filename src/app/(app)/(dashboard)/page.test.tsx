import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalScheduleReadModel } from "@/lib/readModels/types";

const getRequestPersonalSchedule = vi.fn();
vi.mock("@/lib/readModels/getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));

const getRequestRecentDashboardChanges = vi.fn();
vi.mock("@/lib/readModels/getRequestRecentDashboardChanges", () => ({ getRequestRecentDashboardChanges }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/DataFreshnessStatus", () => ({
  DataFreshnessStatus: ({ fetchedAt }: { fetchedAt: string }) => <div data-testid="freshness">{fetchedAt}</div>,
}));

const { default: DashboardPage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getRequestPersonalSchedule.mockReset();
  getRequestRecentDashboardChanges.mockReset();
  getRequestRecentDashboardChanges.mockResolvedValue([]);
});

function model(overrides: Partial<PersonalScheduleReadModel> = {}): PersonalScheduleReadModel {
  return {
    person: { id: "p_1", name: "דני בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
    fetchedAt: "2026-08-12T08:00:00.000Z",
    localNow: { date: "2026-08-12", minuteOfDay: 600 },
    todayEvents: [],
    upcomingEvents: [],
    calendarEvents: [],
    currentAssignments: [],
    nextAssignmentGroup: null,
    currentShiftContexts: [],
    nextShiftContexts: [],
    currentAdjacentShiftContexts: [],
    issues: [],
    dutyBlocks: [],
    dutyActions: [],
    ...overrides,
  };
}

describe("DashboardPage — PR #36 recent-changes wiring", () => {
  it("passes the loaded recent changes through to the Dashboard, which renders the recap", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "ok", model: model() });
    getRequestRecentDashboardChanges.mockResolvedValue([
      {
        key: "change:job_1",
        category: "shift",
        title: "⚠️ שינוי בשיבוץ",
        body: "השיבוץ שלך ליום חמישי השתנה: יום → לילה",
        happenedAt: "2026-08-12T07:42:00.000Z",
        href: "/schedule?date=2026-08-19",
        date: "2026-08-19",
      },
    ]);

    const element = await DashboardPage();
    render(element);

    expect(screen.getByText("מה השתנה")).toBeInTheDocument();
  });

  it("an empty recent-changes result renders no trace of the recap", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "ok", model: model() });

    const element = await DashboardPage();
    render(element);

    expect(screen.queryByText("מה השתנה")).toBeNull();
  });

  it("never fetches recent changes at all when the personal schedule itself failed (configuration error)", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "configuration_error", message: "boom" });

    await DashboardPage();

    expect(getRequestRecentDashboardChanges).not.toHaveBeenCalled();
  });
});
