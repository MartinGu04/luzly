import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";

const getRequestPersonalSchedule = vi.fn();
const getAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();
const getJerusalemLocalNow = vi.fn();

vi.mock("./getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));

const { loadPermanentManagerHomeReadModel } = await import("./permanentManagerHome");

function personnelSheet(rows: (string | boolean)[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}
function scheduleSheet(rows: (string | number)[][]): RawSheet {
  return { name: "משמרות + תורנויות", values: rows };
}
function settingsSheet(rows: string[][]): RawSheet {
  return { name: "הגדרות", values: rows };
}

const PERMANENT_MANAGER_ROWS: (string | boolean)[][] = [
  ["שם", "מייל", "מנהל", 'סוג כ"א'],
  ["דני מנהל", "dani@example.invalid", true, "קבע"],
];

const REGULAR_MANAGER_ROWS: (string | boolean)[][] = [
  ["שם", "מייל", "מנהל", 'סוג כ"א'],
  ["דני מנהל", "dani@example.invalid", true, "חובה"],
];

const SETTINGS_ROWS_VALID: string[][] = [
  ["הגדרה", "ערך"],
  ["תחילת משמרת יום", "07:30"],
];

function snapshot(personnelRows: (string | boolean)[][]) {
  return {
    fetchedAt: "2026-08-13T08:00:00.000Z",
    sheets: [personnelSheet(personnelRows), scheduleSheet([]), settingsSheet(SETTINGS_ROWS_VALID)],
  };
}

function okPersonalResult(isManager: boolean, personnelType: string | null) {
  return {
    status: "ok" as const,
    model: {
      person: {
        id: "p_dani",
        name: "דני מנהל",
        isManager,
        isTechnician: false,
        isSupervisor: false,
        personnelType,
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
      currentAdjacentShiftContexts: [],
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
  getJerusalemLocalNow.mockReturnValue({ date: "2026-08-13", minuteOfDay: 600 });
  getAuthenticatedIdentity.mockResolvedValue({
    status: "authenticated",
    userId: "u1",
    email: "dani@example.invalid",
    avatarUrl: null,
  });
  getWorkbookSnapshot.mockResolvedValue(snapshot(PERMANENT_MANAGER_ROWS));
});

describe("loadPermanentManagerHomeReadModel — auth pass-through states", () => {
  it("unauthenticated: no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadPermanentManagerHomeReadModel();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("configuration_error: passes the message through, no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "Missing shift start time configuration.",
      person: { id: "p_dani", name: "דני מנהל", isManager: true, isTechnician: false, isSupervisor: false, personnelType: "קבע" },
    });
    const result = await loadPermanentManagerHomeReadModel();
    expect(result).toEqual({ status: "configuration_error", message: "Missing shift start time configuration." });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });
});

describe("loadPermanentManagerHomeReadModel — eligibility: permanent AND manager only", () => {
  it("non-manager: forbidden, no manager-wide fetch at all", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(false, "קבע"));
    const result = await loadPermanentManagerHomeReadModel();
    expect(result).toEqual({ status: "forbidden" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("manager but NOT permanent (חובה): forbidden, even though the manager-wide fetch IS authorized", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true, "חובה"));
    getWorkbookSnapshot.mockResolvedValue(snapshot(REGULAR_MANAGER_ROWS));
    const result = await loadPermanentManagerHomeReadModel();
    expect(result).toEqual({ status: "forbidden" });
  });

  it("permanent but NOT manager: forbidden, no manager-wide fetch at all", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(false, "קבע"));
    const result = await loadPermanentManagerHomeReadModel();
    expect(result).toEqual({ status: "forbidden" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("permanent AND manager: ok, requesting exactly personnel+schedule+settings (never Potential)", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true, "קבע"));
    const result = await loadPermanentManagerHomeReadModel();
    expect(result.status).toBe("ok");
    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel", "schedule", "settings"]);
  });
});

describe("loadPermanentManagerHomeReadModel — success shape", () => {
  it("returns a read model whose person is the authorized permanent manager", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true, "קבע"));
    const result = await loadPermanentManagerHomeReadModel();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.person.name).toBe("דני מנהל");
      expect(result.model.person.isManager).toBe(true);
      expect(result.model.currentShift.timing.status).toBe("resolved");
    }
  });
});
