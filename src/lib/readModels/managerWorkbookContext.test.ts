import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";

const getRequestPersonalSchedule = vi.fn();
const getAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();

vi.mock("./getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));

const { loadManagerWorkbookContext, loadManagerPersonnelContext, getManagerWorkbookSheet, MANAGER_WORKBOOK_SOURCES } =
  await import("./managerWorkbookContext");

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

function okPersonalResult(isManager: boolean, avatarUrl: string | null = null) {
  return {
    status: "ok" as const,
    avatarUrl,
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
  getAuthenticatedIdentity.mockResolvedValue({
    status: "authenticated",
    userId: "u1",
    email: "dani@example.invalid",
    avatarUrl: null,
  });
  getWorkbookSnapshot.mockResolvedValue(managerSnapshot());
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
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("configuration_error: passes the message through, no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "Missing shift start time configuration.",
      person: { id: "p_dani", name: "דני מנהל", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
    });
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "configuration_error", message: "Missing shift start time configuration." });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });
});

describe("loadManagerWorkbookContext — manager authorization", () => {
  it("non-manager: forbidden, manager batch is never fetched", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(false));
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "forbidden" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("manager: fetches exactly the 5 shared manager sources, exactly once", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    await loadManagerWorkbookContext();
    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(MANAGER_WORKBOOK_SOURCES);
    expect(MANAGER_WORKBOOK_SOURCES).toEqual(["personnel", "schedule", "settings", "potentialH1", "potentialH2"]);
  });

  it("fresh manager snapshot no longer marks the person as manager -> fails closed, data discarded", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    getWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({ personnel: [["שם", "מייל", "מנהל"], ["דני מנהל", "dani@example.invalid", false]] }),
    );
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "forbidden" });
    expect(result).not.toHaveProperty("context");
  });

  it("fresh snapshot where the person is no longer mapped at all also fails closed", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    getWorkbookSnapshot.mockResolvedValue(
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

  it("carries the manager's own avatarUrl through from getRequestPersonalSchedule, never a new lookup", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true, "https://example.invalid/photo.jpg"));
    const result = await loadManagerWorkbookContext();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context.avatarUrl).toBe("https://example.invalid/photo.jpg");
    }
  });

  it("avatarUrl is null when the manager has no Google profile photo", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true, null));
    const result = await loadManagerWorkbookContext();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context.avatarUrl).toBeNull();
    }
  });

  it("calls getRequestPersonalSchedule exactly once", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    await loadManagerWorkbookContext();
    expect(getRequestPersonalSchedule).toHaveBeenCalledTimes(1);
  });
});

function personnelOnlySnapshot(rows: (string | boolean)[][] = MANAGER_PERSONNEL_ROWS) {
  return { fetchedAt: "2026-08-21T17:32:00.000Z", sheets: [personnelSheet(rows)] };
}

describe("loadManagerPersonnelContext -- the lightweight polling authorization path", () => {
  beforeEach(() => {
    getWorkbookSnapshot.mockResolvedValue(personnelOnlySnapshot());
  });

  it("never calls getRequestPersonalSchedule -- does NOT load/parse Schedule, Settings, or Potential, unlike loadManagerWorkbookContext", async () => {
    await loadManagerPersonnelContext();
    expect(getRequestPersonalSchedule).not.toHaveBeenCalled();
  });

  it("fetches ONLY the personnel source via the cached getWorkbookSnapshot -- never the full 5-source manager set, never a second fetch", async () => {
    await loadManagerPersonnelContext();
    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel"]);
  });

  it("an unauthenticated caller triggers no workbook read at all", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadManagerPersonnelContext();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("an authenticated caller with no usable email triggers no workbook read at all", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: "u1" });
    const result = await loadManagerPersonnelContext();
    expect(result).toEqual({ status: "missing_email" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("an email absent from כ\"א fails closed as unmapped", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u2",
      email: "stranger@example.invalid",
      avatarUrl: null,
    });
    const result = await loadManagerPersonnelContext();
    expect(result).toEqual({ status: "unmapped" });
  });

  it("a mapped but NON-manager person fails closed as forbidden -- manager status is never trusted from the client", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u3",
      email: "noa@example.invalid",
      avatarUrl: null,
    });
    const result = await loadManagerPersonnelContext();
    expect(result).toEqual({ status: "forbidden" });
  });

  it("success: returns the re-verified manager and the parsed roster, nothing else (no snapshot, no avatarUrl -- this caller never needs them)", async () => {
    const result = await loadManagerPersonnelContext();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context.manager.name).toBe("דני מנהל");
      expect(result.context.people).toHaveLength(2);
      expect(result.context).not.toHaveProperty("snapshot");
      expect(result.context).not.toHaveProperty("avatarUrl");
    }
  });

  it("reuses the SAME parsePersonnelSheet/resolveIdentityAgainstPeople model -- a fresh snapshot where the manager flag flips also fails closed", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      personnelOnlySnapshot([["שם", "מייל", "מנהל"], ["דני מנהל", "dani@example.invalid", false]]),
    );
    const result = await loadManagerPersonnelContext();
    expect(result).toEqual({ status: "forbidden" });
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
