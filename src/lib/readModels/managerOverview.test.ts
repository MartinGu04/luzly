import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { ManagerOverviewParams } from "./managerOverviewParams";

const getRequestAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();
const getJerusalemLocalNow = vi.fn();
const computeNotificationReadiness = vi.fn();

vi.mock("@/lib/auth/getRequestAuthenticatedIdentity", () => ({ getRequestAuthenticatedIdentity }));
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

const DEFAULT_PARAMS: ManagerOverviewParams = { personId: null, range: "7d", month: null };

const AUTHENTICATED_MANAGER = {
  status: "authenticated" as const,
  userId: "u1",
  email: "dani@example.invalid",
  avatarUrl: null,
};

beforeEach(() => {
  getRequestAuthenticatedIdentity.mockReset();
  getWorkbookSnapshot.mockReset();
  getJerusalemLocalNow.mockReset();
  computeNotificationReadiness.mockReset();
  getJerusalemLocalNow.mockReturnValue({ date: "2026-08-13", minuteOfDay: 600 });
  getRequestAuthenticatedIdentity.mockResolvedValue(AUTHENTICATED_MANAGER);
  getWorkbookSnapshot.mockResolvedValue(managerSnapshot());
  computeNotificationReadiness.mockResolvedValue([]);
});

describe("loadManagerOverviewReadModel — auth pass-through states", () => {
  it("unauthenticated: no workbook fetch at all", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("missing_email: no workbook fetch at all", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: "u1" });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(result).toEqual({ status: "missing_email" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("unmapped: fails closed after the fresh personnel parse", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u9",
      email: "stranger@example.invalid",
      avatarUrl: null,
    });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(result).toEqual({ status: "unmapped" });
  });

  it("ambiguous_identity: fails closed when the email matches more than one כ\"א record", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u9",
      email: "dup@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({
        personnel: [
          ["שם", "מייל", "מנהל"],
          ["דני א", "dup@example.invalid", true],
          ["דני ב", "dup@example.invalid", true],
        ],
      }),
    );
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(result).toEqual({ status: "ambiguous_identity" });
  });
});

describe("loadManagerOverviewReadModel — manager authorization", () => {
  it("non-manager (mapped, isManager=false) hitting /manager: forbidden, Potential is never parsed/rendered", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u2",
      email: "noa@example.invalid",
      avatarUrl: null,
    });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(result).toEqual({ status: "forbidden" });
  });

  it("manager: the manager batch fetch is allowed, requesting exactly the 5 manager sources", async () => {
    await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
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
    getWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({
        personnel: [
          ["שם", "מייל", "מנהל"],
          ["דני מנהל", "dani@example.invalid", false],
        ],
      }),
    );
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(result).toEqual({ status: "forbidden" });
    expect(result).not.toHaveProperty("model");
  });

  it("fresh snapshot where the person is no longer mapped at all also fails closed", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({ personnel: [["שם", "מייל", "מנהל"], ["מישהו אחר", "other@example.invalid", true]] }),
    );
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(result).toEqual({ status: "unmapped" });
  });

  it("an invalid/missing shift configuration in the manager fetch fails closed as configuration_error", async () => {
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
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(result.status).toBe("configuration_error");
  });
});

describe("loadManagerOverviewReadModel — success", () => {
  it("builds an ok ManagerOverviewReadModel for an authorized manager", async () => {
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.manager.name).toBe("דני מנהל");
      expect(result.model.roster).toHaveLength(2);
      expect(result.model.range.key).toBe("7d");
    }
  });

  it("passes the requested range/person params through to the model", async () => {
    const result = await loadManagerOverviewReadModel(
      { personId: null, range: "month", month: "2026-02" },
      false,
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.range.month).toEqual({ year: 2026, month: 2 });
    }
  });

  it("threads the manager's own avatarUrl through, never a new lookup", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      ...AUTHENTICATED_MANAGER,
      avatarUrl: "https://example.invalid/photo.jpg",
    });
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.manager.avatarUrl).toBe("https://example.invalid/photo.jpg");
    }
  });

  it("calls getRequestAuthenticatedIdentity exactly once (a single live identity check, no duplicate)", async () => {
    await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(getRequestAuthenticatedIdentity).toHaveBeenCalledTimes(1);
  });

  it("does not leak the manager's own email anywhere in the serialized result", async () => {
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(JSON.stringify(result)).not.toContain("dani@example.invalid");
  });
});

describe("loadManagerOverviewReadModel — adoption (התחברויות והתראות) readiness wiring", () => {
  it("needsAdoptionReadiness=true + everyone scope: calls computeNotificationReadiness exactly once, with the full roster", async () => {
    await loadManagerOverviewReadModel(DEFAULT_PARAMS, true);
    expect(computeNotificationReadiness).toHaveBeenCalledTimes(1);
    expect(computeNotificationReadiness.mock.calls[0][0]).toHaveLength(2);
  });

  it("needsAdoptionReadiness=false (every non-logins category: overview/shifts/personnel/duties): never calls the privileged readiness lookup, model records status: skipped", async () => {
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, false);
    expect(computeNotificationReadiness).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.adoption).toEqual({ status: "skipped" });
    }
  });

  it("selected-person scope: never calls the privileged readiness lookup even when needsAdoptionReadiness=true (category=logins AND person selected simultaneously), model records status: skipped", async () => {
    const result = await loadManagerOverviewReadModel({ personId: "p_dani", range: "7d", month: null }, true);
    expect(computeNotificationReadiness).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.adoption).toEqual({ status: "skipped" });
    }
  });

  it("threads the resolved readiness result into the safe manager projection", async () => {
    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, true);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const [firstPersonId, secondPersonId] = result.model.roster.map((p) => p.id);
    computeNotificationReadiness.mockResolvedValueOnce([
      { personId: firstPersonId, status: "no_push_subscription", avatarUrl: null },
      { personId: secondPersonId, status: "ready", avatarUrl: null },
    ]);

    const second = await loadManagerOverviewReadModel(DEFAULT_PARAMS, true);
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.model.adoption.status).toBe("available");
    if (second.model.adoption.status !== "available") return;
    expect(second.model.adoption.view.summary).toEqual({
      totalCount: 2,
      loggedInCount: 2,
      notLoggedInCount: 0,
      notificationReadyCount: 1,
      loggedInNotReadyCount: 1,
      dataIssueCount: 0,
    });
  });

  it("degrades to adoption: { status: 'unavailable' } (never throws, and never conflated with skipped) when the readiness lookup itself fails, but only when it was actually attempted", async () => {
    computeNotificationReadiness.mockRejectedValue(new Error("supabase unreachable"));

    const result = await loadManagerOverviewReadModel(DEFAULT_PARAMS, true);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.adoption).toEqual({ status: "unavailable" });
    }
  });
});
