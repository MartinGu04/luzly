import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalScheduleReadModel } from "@/lib/readModels/types";
import type { PermanentManagerHomeReadModel } from "@/lib/readModels/permanentManagerHomeTypes";

const getRequestPersonalSchedule = vi.fn();
vi.mock("@/lib/readModels/getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));

const getRequestRecentDashboardChanges = vi.fn();
vi.mock("@/lib/readModels/getRequestRecentDashboardChanges", () => ({ getRequestRecentDashboardChanges }));

const getRequestPermanentManagerHome = vi.fn();
vi.mock("@/lib/readModels/getRequestPermanentManagerHome", () => ({ getRequestPermanentManagerHome }));

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
  getRequestPermanentManagerHome.mockReset();
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

function shift(overrides: Partial<PermanentManagerHomeReadModel["previousShift"]> = {}) {
  return {
    date: "2026-08-12",
    period: "day" as const,
    startLocalTime: "07:30",
    endLocalTime: "19:30",
    supervisors: [],
    technicians: [],
    coverageStatus: "missing" as const,
    missingIntervals: [{ startMinute: 450, endMinute: 1170 }],
    roleCoverage: {
      technician: { status: "missing" as const, missingIntervals: [{ startMinute: 450, endMinute: 1170 }] },
      supervisor: { status: "missing" as const, missingIntervals: [{ startMinute: 450, endMinute: 1170 }] },
    },
    ...overrides,
  };
}

function permanentManagerHomeModel(
  overrides: Partial<PermanentManagerHomeReadModel> = {},
): PermanentManagerHomeReadModel {
  return {
    person: { id: "p_mgr", name: "מנהל בדיקה", isManager: true, isTechnician: false, isSupervisor: false, personnelType: "קבע" },
    fetchedAt: "2026-08-12T08:00:00.000Z",
    localNow: { date: "2026-08-12", minuteOfDay: 480 },
    previousShift: shift({ date: "2026-08-11", period: "night", startLocalTime: "19:30", endLocalTime: "07:30" }),
    currentShift: {
      ...shift(),
      timing: {
        status: "resolved" as const,
        startLocalTime: "07:30",
        endLocalTime: "19:30",
        durationMinutes: 720,
        elapsedMinutesAtLoad: 30,
        remainingMinutesAtLoad: 690,
        progressPercentAtLoad: 4,
        minutesUntilStartAtLoad: 0,
      },
    },
    nextShift: shift({ period: "night", startLocalTime: "19:30", endLocalTime: "07:30" }),
    todayDuties: [],
    todayAbsences: [],
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

describe("DashboardPage — permanent-manager Home eligibility", () => {
  it("permanent + manager: receives the operational Home, never the normal Dashboard", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({
        person: { id: "p_mgr", name: "מנהל בדיקה", isManager: true, isTechnician: false, isSupervisor: false, personnelType: "קבע" },
      }),
    });
    getRequestPermanentManagerHome.mockResolvedValue({ status: "ok", model: permanentManagerHomeModel() });

    const element = await DashboardPage();
    render(element);

    expect(screen.getByText("מה קורה עכשיו במחלקה?")).toBeInTheDocument();
    expect(getRequestRecentDashboardChanges).not.toHaveBeenCalled();
  });

  it("permanent + non-manager: receives the normal personal Dashboard, never the operational Home", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({
        person: { id: "p_1", name: "עובד בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: "קבע" },
      }),
    });

    const element = await DashboardPage();
    render(element);

    expect(screen.queryByText("מה קורה עכשיו במחלקה?")).toBeNull();
    expect(getRequestPermanentManagerHome).not.toHaveBeenCalled();
  });

  it("regular (חובה) + manager: receives the normal personal Dashboard, never the operational Home", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({
        person: { id: "p_mgr2", name: "מנהל חובה", isManager: true, isTechnician: false, isSupervisor: false, personnelType: "חובה" },
      }),
    });

    const element = await DashboardPage();
    render(element);

    expect(screen.queryByText("מה קורה עכשיו במחלקה?")).toBeNull();
    expect(getRequestPermanentManagerHome).not.toHaveBeenCalled();
  });

  it("regular (חובה) + non-manager: receives the normal personal Dashboard", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({ person: { id: "p_1", name: "עובד בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: "חובה" } }),
    });

    const element = await DashboardPage();
    render(element);

    expect(screen.queryByText("מה קורה עכשיו במחלקה?")).toBeNull();
    expect(getRequestPermanentManagerHome).not.toHaveBeenCalled();
  });

  it("reserve (מילואים): receives the normal personal Dashboard, even if isManager were somehow true", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({
        person: { id: "p_res", name: "מילואימניק", isManager: true, isTechnician: false, isSupervisor: false, personnelType: "מילואים" },
      }),
    });

    const element = await DashboardPage();
    render(element);

    expect(screen.queryByText("מה קורה עכשיו במחלקה?")).toBeNull();
    expect(getRequestPermanentManagerHome).not.toHaveBeenCalled();
  });

  it("unclassified personnelType: receives the normal personal Dashboard, even if isManager were somehow true", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({
        person: { id: "p_unk", name: "לא מסווג", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
      }),
    });

    const element = await DashboardPage();
    render(element);

    expect(screen.queryByText("מה קורה עכשיו במחלקה?")).toBeNull();
    expect(getRequestPermanentManagerHome).not.toHaveBeenCalled();
  });

  it("falls back to the normal Dashboard if the permanent-manager loader unexpectedly returns non-ok", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({
        person: { id: "p_mgr", name: "מנהל בדיקה", isManager: true, isTechnician: false, isSupervisor: false, personnelType: "קבע" },
      }),
    });
    getRequestPermanentManagerHome.mockResolvedValue({ status: "forbidden" });

    const element = await DashboardPage();
    render(element);

    expect(screen.queryByText("מה קורה עכשיו במחלקה?")).toBeNull();
    expect(getRequestRecentDashboardChanges).toHaveBeenCalled();
  });
});
