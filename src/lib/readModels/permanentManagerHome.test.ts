import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";

const getAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();
const getJerusalemLocalNow = vi.fn();

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

const PERMANENT_NON_MANAGER_ROWS: (string | boolean)[][] = [
  ["שם", "מייל", "מנהל", 'סוג כ"א'],
  ["דני עובד", "dani@example.invalid", false, "קבע"],
];

const SETTINGS_ROWS_VALID: string[][] = [
  ["הגדרה", "ערך"],
  ["תחילת משמרת יום", "07:30"],
];

function snapshot(personnelRows: (string | boolean)[][], settingsRows: string[][] = SETTINGS_ROWS_VALID) {
  return {
    fetchedAt: "2026-08-13T08:00:00.000Z",
    sheets: [personnelSheet(personnelRows), scheduleSheet([]), settingsSheet(settingsRows)],
  };
}

beforeEach(() => {
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
  it("unauthenticated: no workbook fetch at all", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadPermanentManagerHomeReadModel();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("an invalid/missing shift configuration on an authorized permanent manager's snapshot fails closed as configuration_error -- the manager-wide fetch DOES happen (authorization is settled before ShiftSchedule is ever built)", async () => {
    getWorkbookSnapshot.mockResolvedValue(snapshot(PERMANENT_MANAGER_ROWS, [["הגדרה", "ערך"]]));
    const result = await loadPermanentManagerHomeReadModel();
    expect(result.status).toBe("configuration_error");
    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe("loadPermanentManagerHomeReadModel — eligibility: permanent AND manager only", () => {
  it("non-manager: forbidden", async () => {
    getWorkbookSnapshot.mockResolvedValue(snapshot(PERMANENT_NON_MANAGER_ROWS));
    const result = await loadPermanentManagerHomeReadModel();
    expect(result).toEqual({ status: "forbidden" });
  });

  it("manager but NOT permanent (חובה): forbidden, even though the manager-wide fetch IS authorized", async () => {
    getWorkbookSnapshot.mockResolvedValue(snapshot(REGULAR_MANAGER_ROWS));
    const result = await loadPermanentManagerHomeReadModel();
    expect(result).toEqual({ status: "forbidden" });
  });

  it("permanent but NOT manager: forbidden", async () => {
    getWorkbookSnapshot.mockResolvedValue(snapshot(PERMANENT_NON_MANAGER_ROWS));
    const result = await loadPermanentManagerHomeReadModel();
    expect(result).toEqual({ status: "forbidden" });
  });

  it("permanent AND manager: ok, requesting exactly personnel+schedule+settings (never Potential)", async () => {
    const result = await loadPermanentManagerHomeReadModel();
    expect(result.status).toBe("ok");
    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel", "schedule", "settings"]);
  });
});

describe("loadPermanentManagerHomeReadModel — success shape", () => {
  it("returns a read model whose person is the authorized permanent manager", async () => {
    const result = await loadPermanentManagerHomeReadModel();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.person.name).toBe("דני מנהל");
      expect(result.model.person.isManager).toBe(true);
      expect(result.model.currentShift.timing.status).toBe("resolved");
    }
  });
});
