import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";

const getRequestPersonalSchedule = vi.fn();
const getAuthenticatedIdentity = vi.fn();
const fetchRawWorkbookSnapshot = vi.fn();

vi.mock("./getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/google", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google")>("@/lib/google");
  return { ...actual, fetchRawWorkbookSnapshot };
});

const { loadManagerWorkbookContext, getManagerWorkbookSheet, MANAGER_WORKBOOK_SOURCES } = await import(
  "./managerWorkbookContext"
);

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

function managerSnapshot(overrides: Partial<{ personnel: (string | boolean)[][] }> = {}) {
  return {
    fetchedAt: "2026-08-13T08:00:00.000Z",
    sheets: [
      personnelSheet(overrides.personnel ?? MANAGER_PERSONNEL_ROWS),
      scheduleSheet([]),
      settingsSheet([["הגדרה", "ערך"]]),
      potentialSheet('פוטנציאל תקש"אס 1-6/2026', []),
      potentialSheet('פוטנציאל תקש"אס 7-12/2026', []),
    ],
  };
}

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
      shiftCalendarEvents: [],
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
  fetchRawWorkbookSnapshot.mockReset();
  getAuthenticatedIdentity.mockResolvedValue({
    status: "authenticated",
    userId: "u1",
    email: "dani@example.invalid",
    avatarUrl: null,
  });
  fetchRawWorkbookSnapshot.mockResolvedValue(managerSnapshot());
});

describe("loadManagerWorkbookContext — auth pass-through states", () => {
  it.each([
    ["unauthenticated", { status: "unauthenticated" }],
    ["missing_email", { status: "missing_email" }],
    ["unmapped", { status: "unmapped" }],
    ["ambiguous_identity", { status: "ambiguous_identity" }],
  ])("%s: passes through, no manager fetch", async (_label, personalResult) => {
    getRequestPersonalSchedule.mockResolvedValue(personalResult);
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual(personalResult);
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("configuration_error: passes the message through, no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "Missing shift start time configuration.",
      person: { id: "p_dani", name: "דני מנהל", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
    });
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "configuration_error", message: "Missing shift start time configuration." });
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
  });
});

describe("loadManagerWorkbookContext — manager authorization", () => {
  it("non-manager: forbidden, manager batch is never fetched", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(false));
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "forbidden" });
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("manager: fetches exactly the 5 shared manager sources, exactly once", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    await loadManagerWorkbookContext();
    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledWith(MANAGER_WORKBOOK_SOURCES);
    expect(MANAGER_WORKBOOK_SOURCES).toEqual(["personnel", "schedule", "settings", "potentialH1", "potentialH2"]);
  });

  it("fresh manager snapshot no longer marks the person as manager -> fails closed, data discarded", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    fetchRawWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({ personnel: [["שם", "מייל", "מנהל"], ["דני מנהל", "dani@example.invalid", false]] }),
    );
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "forbidden" });
    expect(result).not.toHaveProperty("context");
  });

  it("fresh snapshot where the person is no longer mapped at all also fails closed", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    fetchRawWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({ personnel: [["שם", "מייל", "מנהל"], ["מישהו אחר", "other@example.invalid", true]] }),
    );
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "forbidden" });
  });

  it("success: returns the re-verified manager, full roster, and raw snapshot", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    const result = await loadManagerWorkbookContext();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context.manager.name).toBe("דני מנהל");
      expect(result.context.people).toHaveLength(2);
      expect(result.context.snapshot.sheets).toHaveLength(5);
    }
  });

  it("calls getRequestPersonalSchedule exactly once", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    await loadManagerWorkbookContext();
    expect(getRequestPersonalSchedule).toHaveBeenCalledTimes(1);
  });
});

describe("getManagerWorkbookSheet", () => {
  it("finds a sheet by logical key", () => {
    const snapshot = managerSnapshot();
    const sheet = getManagerWorkbookSheet(snapshot, "personnel");
    expect(sheet.name).toBe('כ"א');
  });

  it("throws when the snapshot is missing the requested sheet", () => {
    const snapshot = { fetchedAt: "x", sheets: [] };
    expect(() => getManagerWorkbookSheet(snapshot, "personnel")).toThrow();
  });
});
