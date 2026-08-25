import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { RawSheet } from "@/lib/google";

const getAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();
const getJerusalemLocalNow = vi.fn();

vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));

const { loadReportOneTomorrow } = await import("./reportOneTomorrow");

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
  ["שם", "מייל", "מנהל", 'אחמ"ש', 'סוג כ"א'],
  ["דני מנהל", "dani@example.invalid", true, false, "קבע"],
  ["עילאי שפירא", "", false, true, "חובה"],
];

const REGULAR_MANAGER_ROWS: (string | boolean)[][] = [
  ["שם", "מייל", "מנהל", 'סוג כ"א'],
  ["דני מנהל", "dani@example.invalid", true, "חובה"],
];

const NON_MANAGER_ROWS: (string | boolean)[][] = [
  ["שם", "מייל", "מנהל", 'סוג כ"א'],
  ["דני עובד", "dani@example.invalid", false, "חובה"],
];

function snapshot(personnelRows: (string | boolean)[][], scheduleRows: (string | number)[][] = []) {
  return {
    fetchedAt: "2026-08-25T08:00:00.000Z",
    sheets: [personnelSheet(personnelRows), scheduleSheet(scheduleRows), settingsSheet([])],
  };
}

beforeEach(() => {
  getAuthenticatedIdentity.mockReset();
  getWorkbookSnapshot.mockReset();
  getJerusalemLocalNow.mockReset();
  getJerusalemLocalNow.mockReturnValue({ date: "2026-08-25", minuteOfDay: 600 });
  getAuthenticatedIdentity.mockResolvedValue({
    status: "authenticated",
    userId: "u1",
    email: "dani@example.invalid",
    avatarUrl: null,
  });
  getWorkbookSnapshot.mockResolvedValue(snapshot(PERMANENT_MANAGER_ROWS));
});

describe("loadReportOneTomorrow — auth pass-through states", () => {
  it("unauthenticated: no workbook fetch at all", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadReportOneTomorrow();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });
});

describe("loadReportOneTomorrow — eligibility: any manager, same isManager-only gate as /manager (never permanent-only)", () => {
  it("not a manager at all: forbidden, regardless of personnelType", async () => {
    getWorkbookSnapshot.mockResolvedValue(snapshot(NON_MANAGER_ROWS));
    const result = await loadReportOneTomorrow();
    expect(result).toEqual({ status: "forbidden" });
  });

  it("permanent AND manager: ok, resolving tomorrow's date from Asia/Jerusalem 'now'", async () => {
    const result = await loadReportOneTomorrow();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.draft.targetDate).toBe("2026-08-26");
    }
  });

  it("a shift-working manager who is NOT permanent (חובה) is equally authorized -- ok, never forbidden", async () => {
    getWorkbookSnapshot.mockResolvedValue(snapshot(REGULAR_MANAGER_ROWS));
    const result = await loadReportOneTomorrow();
    expect(result.status).toBe("ok");
  });

  it("a מילואים (reserve) manager is equally authorized -- ok, never forbidden", async () => {
    const reserveManagerRows: (string | boolean)[][] = [
      ["שם", "מייל", "מנהל", 'סוג כ"א'],
      ["דני מנהל", "dani@example.invalid", true, "מילואים"],
    ];
    getWorkbookSnapshot.mockResolvedValue(snapshot(reserveManagerRows));
    const result = await loadReportOneTomorrow();
    expect(result.status).toBe("ok");
  });
});

describe("loadReportOneTomorrow — draft content", () => {
  it("resolves a regular supervisor's day-shift status from the schedule sheet for tomorrow's date", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      snapshot(PERMANENT_MANAGER_ROWS, [
        ["תאריך", "עילאי שפירא"],
        ["2026-08-26", 'אחמ"ש יום'],
      ]),
    );

    const result = await loadReportOneTomorrow();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const managers = result.draft.sections.find((s) => s.section === "regular_manager")!;
      expect(managers.people.map((p) => `${p.name} - ${p.generatedStatus}`)).toContain('עילאי שפירא - נוכח, אחמ"ש יום');
    }
  });
});
