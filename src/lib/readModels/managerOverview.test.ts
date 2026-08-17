import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { ManagerOverviewParams } from "./managerOverviewParams";

const getRequestPersonalSchedule = vi.fn();
const getAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();
const getJerusalemLocalNow = vi.fn();
const computeNotificationReadiness = vi.fn();

vi.mock("./getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));
vi.mock("@/lib/notifications/engine/readiness", () => ({ computeNotificationReadiness }));

const { loadManagerOverviewReadModel } = await import("./managerOverview");

function personnelSheet(rows: (string | boolean)[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}
function scheduleSheet(rows: (string | number)[][]): RawSheet {
  return { name: "משמרות + תורנויות", values: rows };
}
function settingsSheet(rows: string[][]): RawSheet {
  return { name: "הגדרות", values: rows };
}
function potentialSheet(name: string, rows: (string | number)[][]): RawSheet {
  return { name, values: rows };
}

const MANAGER_PERSONNEL_ROWS: (string | boolean)[][] = [
  ["שם", "מייל", "מנהל"],
  ["דני מנהל", "dani@example.invalid", true],
  ["נועה עובדת", "noa@example.invalid", false],
];

const SETTINGS_ROWS_VALID: string[][] = [
  ["הגדרה", "ערך"],
  ["תחילת משמרת יום", "07:30"],
];

function managerSnapshot(overrides: Partial<{ personnel: (string | boolean)[][] }> = {}) {
  return {
    fetchedAt: "2026-08-13T08:00:00.000Z",
    sheets: [
      personnelSheet(overrides.personnel ?? MANAGER_PERSONNEL_ROWS),
      scheduleSheet([]),
      settingsSheet(SETTINGS_ROWS_VALID),
      potentialSheet('פוטנציאל תקש"אס 1-6/2026', []),
      potentialSheet('פוטנציאל תקש"אס 7-12/2026', []),
    ],
  };
}

const DEFAULT_PARAMS: ManagerOverviewParams = { personId: null, range: "7d", month: null, problemsOnly: false };

function okPersonalResult(isManager: boolean) {
  return {
    status: "ok" as const,
    model: {
      person: {
        id: "p_dani",
        name: "דני מנהל",
        isManager,
        isTechnician: false,
        isSupervisor: false,
        personnelType: null,
      },
      fetchedAt: "2026-08-13T08:00:00.000Z",
      localNow: { date: "2026-08-13", minuteOfDay: 600 },
      todayEvents: [],
      upcomingEvents: [],
      calendarEvents: [],
      currentAssignments: [],
      nextAssignmentGroup: null,
      currentShiftContexts: [],
      nextShiftContexts: [],
      issues: [],
      dutyBlocks: [],
      dutyActions: [],
    },
  };
}

beforeEach(() => {
  getRequestPersonalSchedule.mockReset();
  getAuthenticatedIdentity.mockReset();
  getWorkbookSnapshot.mockReset();
  getJerusalemLocalNow.mockReset();
  computeNotificationReadiness.mockReset();
  getJerusalemLocalNow.mockReturnValue({ date: "2026-08-13", minuteOfDay: 600 });
  getAuthenticatedIdentity.mockResolvedValue({
    status: "authenticated",
    userId: "u1",
    email: "dani@example.invalid",
    avatarUrl: null,
  });
  getWorkbookSnapshot.mockResolvedValue(managerSnapshot());
  computeNotificationReadiness.mockResolvedValue([]);
});

describe("loadManagerOverviewReadModel — auth pass-through states", () => {
  it("unauthenticated: no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("missing_email: no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "missing_email" });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "missing_email" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("unmapped: no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unmapped" });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "unmapped" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("ambiguous_identity: no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "ambiguous_identity" });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "ambiguous_identity" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("configuration_error: passes the message through, no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "Missing shift start time configuration.",
      person: { id: "p_dani", name: "דני מנהל", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
    });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "configuration_error", message: "Missing shift start time configuration." });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });
});

describe("loadManagerOverviewReadModel — manager authorization", () => {
  it("non-manager (mapped, ok, isManager=false) hitting /manager: forbidden, Potential is never fetched", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(false));
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "forbidden" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("manager: the manager batch fetch is allowed, requesting exactly the 5 manager sources", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(getWorkbookSnapshot).toHaveBeenCalledWith([
      "personnel",
      "schedule",
      "settings",
      "potentialH1",
      "potentialH2",
    ]);
  });

  it("fresh manager snapshot no longer marks the person as manager -> fails closed (forbidden), fetched data is never rendered", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    // The FRESH manager-only fetch now returns a personnel sheet where this person is no longer flagged as manager.
    getWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({
        personnel: [
          ["שם", "מייל", "מנהל"],
          ["דני מנהל", "dani@example.invalid", false],
        ],
      }),
    );
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "forbidden" });
    expect(result).not.toHaveProperty("model");
  });

  it("fresh snapshot where the person is no longer mapped at all also fails closed", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    getWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({ personnel: [["שם", "מייל", "מנהל"], ["מישהו אחר", "other@example.invalid", true]] }),
    );
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "forbidden" });
  });

  it("an invalid/missing shift configuration in the manager fetch fails closed as configuration_error", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    getWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-13T08:00:00.000Z",
      sheets: [
        personnelSheet(MANAGER_PERSONNEL_ROWS),
        scheduleSheet([]),
        settingsSheet([["הגדרה", "ערך"]]),
        potentialSheet('פוטנציאל תקש"אס 1-6/2026', []),
        potentialSheet('פוטנציאל תקש"אס 7-12/2026', []),
      ],
    });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result.status).toBe("configuration_error");
  });
});

describe("loadManagerOverviewReadModel — success", () => {
  it("builds an ok ManagerOverviewReadModel for an authorized manager", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.manager.name).toBe("דני מנהל");
      expect(result.model.roster).toHaveLength(2);
      expect(result.model.range.key).toBe("7d");
    }
  });

  it("passes the requested range/person/problems-only params through to the model", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    const result = await loadManagerOverviewReadModel({
      personId: null,
      range: "month",
      month: "2026-02",
      problemsOnly: true,
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.range.month).toEqual({ year: 2026, month: 2 });
      expect(result.model.problemsOnly).toBe(true);
    }
  });

  it("calls getRequestPersonalSchedule exactly once (shared request-scoped result, no duplicate identity check)", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(getRequestPersonalSchedule).toHaveBeenCalledTimes(1);
  });

  it("does not leak the manager's own email anywhere in the serialized result", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(JSON.stringify(result)).not.toContain("dani@example.invalid");
  });
});

describe("loadManagerOverviewReadModel — PR #40 notification readiness wiring", () => {
  it("everyone scope: calls computeNotificationReadiness exactly once, with the full roster", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(computeNotificationReadiness).toHaveBeenCalledTimes(1);
    expect(computeNotificationReadiness.mock.calls[0][0]).toHaveLength(2);
  });

  it("selected-person scope: never calls the privileged readiness lookup, model records status: skipped", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    const result = await loadManagerOverviewReadModel({
      personId: "p_dani",
      range: "7d",
      month: null,
      problemsOnly: false,
    });
    expect(computeNotificationReadiness).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.notificationReadiness).toEqual({ status: "skipped" });
    }
  });

  it("threads the resolved readiness result into the safe manager projection", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    getWorkbookSnapshot.mockResolvedValue(managerSnapshot());
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const [firstPersonId] = result.model.roster.map((p) => p.id);
    computeNotificationReadiness.mockResolvedValueOnce([
      { personId: firstPersonId, status: "no_push_subscription" },
    ]);

    const second = await loadManagerOverviewReadModel(DEFAULT_PARAMS);
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.model.notificationReadiness).toEqual({
      status: "available",
      view: {
        readyCount: 0,
        totalCount: 1,
        blockers: [{ personId: firstPersonId, personName: result.model.roster[0].name, status: "no_push_subscription" }],
      },
    });
  });

  it("degrades to notificationReadiness: { status: 'unavailable' } (never throws, and never conflated with skipped) when the readiness lookup itself fails", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    computeNotificationReadiness.mockRejectedValue(new Error("supabase unreachable"));

    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.notificationReadiness).toEqual({ status: "unavailable" });
    }
  });
});
