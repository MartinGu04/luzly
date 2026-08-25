import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalScheduleReadModel } from "@/lib/readModels/types";
import type { PermanentManagerHomeReadModel } from "@/lib/readModels/permanentManagerHomeTypes";

const getRequestPersonalSchedule = vi.fn();
vi.mock("@/lib/readModels/getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));

const getRequestDashboardVisitRecap = vi.fn();
vi.mock("@/lib/readModels/getRequestRecentDashboardChanges", () => ({ getRequestDashboardVisitRecap }));

const getRequestPermanentManagerHome = vi.fn();
vi.mock("@/lib/readModels/getRequestPermanentManagerHome", () => ({ getRequestPermanentManagerHome }));

const getRequestReportOneTomorrow = vi.fn();
vi.mock("@/lib/readModels/getRequestReportOneTomorrow", () => ({ getRequestReportOneTomorrow }));

const recordDashboardVisitAction = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/dashboardVisit/actions", () => ({ recordDashboardVisitAction }));

const getCalendarFeedForCurrentUser = vi.fn();
vi.mock("@/lib/calendar/feedStore", () => ({ getCalendarFeedForCurrentUser: (...args: unknown[]) => getCalendarFeedForCurrentUser(...args) }));

// SetupSection (nav redesign pass, rendered by both Dashboard and
// PermanentManagerHome) mounts usePushSubscription, which imports these
// "use server" actions -- mocked defensively so a real (unmocked)
// server-action module is never evaluated in this jsdom test environment,
// same as NotificationBell.test.tsx already does for the same hook.
vi.mock("@/lib/notifications/actions", () => ({
  enablePushNotificationsAction: vi.fn(),
  disablePushNotificationsAction: vi.fn(),
  getPushSubscriptionStatusAction: vi.fn(),
  sendTestNotificationAction: vi.fn(),
}));
vi.mock("@/lib/push/publicConfig", () => ({ getVapidPublicKey: () => "test-public-key" }));

vi.mock("@/lib/reportOne/actions", () => ({ setReserveInclusionPreferenceAction: vi.fn().mockResolvedValue({ ok: true }) }));

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
  getRequestDashboardVisitRecap.mockReset();
  getRequestDashboardVisitRecap.mockResolvedValue({ visitStartedAt: "2026-08-25T10:00:00.000Z", items: [], totalCount: 0 });
  getRequestPermanentManagerHome.mockReset();
  getRequestReportOneTomorrow.mockReset();
  getRequestReportOneTomorrow.mockResolvedValue({ status: "forbidden" });
  recordDashboardVisitAction.mockClear();
  getCalendarFeedForCurrentUser.mockReset();
  getCalendarFeedForCurrentUser.mockResolvedValue({ enabled: false, token: null });
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

describe("DashboardPage — 'מה השתנה מאז הפעם הקודמת' visit recap wiring", () => {
  it("passes the loaded visit recap through to the Dashboard, which renders the recap", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({ person: { id: "p_1", name: "עובד בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: "חובה" } }),
    });
    getRequestDashboardVisitRecap.mockResolvedValue({
      visitStartedAt: "2026-08-25T10:00:00.000Z",
      totalCount: 1,
      items: [
        {
          key: "change:job_1",
          category: "shift",
          title: "⚠️ שינוי בשיבוץ",
          body: "השיבוץ שלך ליום חמישי השתנה: יום → לילה",
          happenedAt: "2026-08-12T07:42:00.000Z",
          href: "/schedule?date=2026-08-19",
          date: "2026-08-19",
        },
      ],
    });

    const element = await DashboardPage();
    render(element);

    expect(screen.getByText("מה השתנה מאז הפעם הקודמת")).toBeInTheDocument();
  });

  it("an empty visit recap result renders no trace of the recap panel", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({ person: { id: "p_1", name: "עובד בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: "חובה" } }),
    });

    const element = await DashboardPage();
    render(element);

    expect(screen.queryByText("מה השתנה מאז הפעם הקודמת")).toBeNull();
  });

  it("never fetches the visit recap at all when the personal schedule itself failed (configuration error)", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "configuration_error", message: "boom" });

    await DashboardPage();

    expect(getRequestDashboardVisitRecap).not.toHaveBeenCalled();
  });
});

describe("DashboardPage — visit recap eligibility gating (1, 2, 3, 4)", () => {
  it("1. regular (חובה) personnel: the visit recap is fetched", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({ person: { id: "p_1", name: "עובד בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: "חובה" } }),
    });

    await DashboardPage();

    expect(getRequestDashboardVisitRecap).toHaveBeenCalled();
  });

  it("2. reserve (מילואים) personnel: the visit recap is fetched", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({ person: { id: "p_res", name: "מילואימניק", isManager: false, isTechnician: true, isSupervisor: false, personnelType: "מילואים" } }),
    });

    await DashboardPage();

    expect(getRequestDashboardVisitRecap).toHaveBeenCalled();
  });

  it("3. permanent (קבע), non-manager personnel: the visit recap is NEVER fetched", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({ person: { id: "p_1", name: "עובד קבע", isManager: false, isTechnician: true, isSupervisor: false, personnelType: "קבע" } }),
    });

    const element = await DashboardPage();
    render(element);

    expect(getRequestDashboardVisitRecap).not.toHaveBeenCalled();
    expect(screen.queryByText("מה השתנה מאז הפעם הקודמת")).toBeNull();
  });

  it("4. unclassified personnel: the visit recap is NEVER fetched", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({ person: { id: "p_unk", name: "לא מסווג", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null } }),
    });

    const element = await DashboardPage();
    render(element);

    expect(getRequestDashboardVisitRecap).not.toHaveBeenCalled();
    expect(screen.queryByText("מה השתנה מאז הפעם הקודמת")).toBeNull();
  });

  it("25. a permanent MANAGER never even reaches the eligibility check -- they get PermanentManagerHome instead, and the visit recap is never fetched", async () => {
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
    expect(getRequestDashboardVisitRecap).not.toHaveBeenCalled();
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
    expect(getRequestDashboardVisitRecap).not.toHaveBeenCalled();
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
    // Still permanent personnel even on this fallback path -- the visit
    // recap stays gated to regular/reserve only, regardless of how the
    // Dashboard was reached.
    expect(getRequestDashboardVisitRecap).not.toHaveBeenCalled();
  });
});

describe("DashboardPage — 'דוח 1 למחר' Home quick action reaches every manager, not only permanent managers", () => {
  const reportOneDraft = {
    targetDate: "2026-08-26",
    sections: [
      { section: "permanent" as const, label: "אנשי קבע💛:", people: [] },
      { section: "reserve" as const, label: "מילואים😍:", people: [] },
      { section: "regular_manager" as const, label: 'סדיר - אחמשים🧑🏻‍💻:', people: [] },
      { section: "regular_technician" as const, label: 'סדיר - טכנאים🧑🏻‍🔧:', people: [] },
    ],
  };

  it("permanent + manager: PermanentManagerHome receives the Report 1 draft", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({
        person: { id: "p_mgr", name: "מנהל בדיקה", isManager: true, isTechnician: false, isSupervisor: false, personnelType: "קבע" },
      }),
    });
    getRequestPermanentManagerHome.mockResolvedValue({ status: "ok", model: permanentManagerHomeModel() });
    getRequestReportOneTomorrow.mockResolvedValue({ status: "ok", draft: reportOneDraft });

    const element = await DashboardPage();
    render(element);

    expect(getRequestReportOneTomorrow).toHaveBeenCalled();
    expect(screen.getByText("🛰️ דוח 1 למחר")).toBeInTheDocument();
  });

  it("regular (חובה) + manager -- a shift-working אחמ\"ש with manager access: the normal Dashboard ALSO receives the Report 1 draft, never forbidden", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({
        person: { id: "p_mgr2", name: "מנהל חובה", isManager: true, isTechnician: false, isSupervisor: true, personnelType: "חובה" },
      }),
    });
    getRequestReportOneTomorrow.mockResolvedValue({ status: "ok", draft: reportOneDraft });

    const element = await DashboardPage();
    render(element);

    expect(screen.queryByText("מה קורה עכשיו במחלקה?")).toBeNull();
    expect(getRequestReportOneTomorrow).toHaveBeenCalled();
    expect(screen.getByText("🛰️ דוח 1 למחר")).toBeInTheDocument();
  });

  it("reserve (מילואים) manager: the normal Dashboard also receives the Report 1 draft", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({
        person: { id: "p_res_mgr", name: "מנהל מילואים", isManager: true, isTechnician: true, isSupervisor: false, personnelType: "מילואים" },
      }),
    });
    getRequestReportOneTomorrow.mockResolvedValue({ status: "ok", draft: reportOneDraft });

    const element = await DashboardPage();
    render(element);

    expect(getRequestReportOneTomorrow).toHaveBeenCalled();
    expect(screen.getByText("🛰️ דוח 1 למחר")).toBeInTheDocument();
  });

  it("a non-manager never triggers getRequestReportOneTomorrow at all, and never sees the quick action", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({ person: { id: "p_1", name: "עובד בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: "חובה" } }),
    });

    const element = await DashboardPage();
    render(element);

    expect(getRequestReportOneTomorrow).not.toHaveBeenCalled();
    expect(screen.queryByText("🛰️ דוח 1 למחר")).toBeNull();
  });

  it("a manager still lands on the normal Dashboard (never the quick action) when Report 1 itself is forbidden/unavailable", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "ok",
      model: model({
        person: { id: "p_mgr3", name: "מנהל חובה", isManager: true, isTechnician: false, isSupervisor: true, personnelType: "חובה" },
      }),
    });
    getRequestReportOneTomorrow.mockResolvedValue({ status: "forbidden" });

    const element = await DashboardPage();
    render(element);

    expect(screen.queryByText("🛰️ דוח 1 למחר")).toBeNull();
  });
});
