import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";

const getRequestAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();
const getJerusalemLocalNow = vi.fn();

vi.mock("@/lib/auth/getRequestAuthenticatedIdentity", () => ({ getRequestAuthenticatedIdentity }));
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));

const { loadSearchReadModel } = await import("./search");

function personnelSheet(rows: string[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}
function scheduleSheet(rows: (string | number)[][]): RawSheet {
  return { name: "משמרות + תורנויות", values: rows };
}
function settingsSheet(rows: string[][]): RawSheet {
  return { name: "הגדרות", values: rows };
}

const PERSONNEL_ROWS: string[][] = [
  ["שם", "מייל"],
  ["דני בדיקה", "dani@example.invalid"],
  ["נועה דוגמה", "noa@example.invalid"],
];

const SETTINGS_ROWS_VALID: string[][] = [
  ["הגדרה", "ערך"],
  ["תחילת משמרת יום", "07:30"],
];

function validSnapshot() {
  return {
    fetchedAt: "2026-08-12T08:00:00.000Z",
    sheets: [personnelSheet(PERSONNEL_ROWS), scheduleSheet([]), settingsSheet(SETTINGS_ROWS_VALID)],
  };
}

beforeEach(() => {
  getRequestAuthenticatedIdentity.mockReset();
  getWorkbookSnapshot.mockReset();
  getJerusalemLocalNow.mockReset();
  getJerusalemLocalNow.mockReturnValue({ date: "2026-08-12", minuteOfDay: 600 });
  getWorkbookSnapshot.mockResolvedValue(validSnapshot());
});

describe("loadSearchReadModel — auth pass-through states", () => {
  it("unauthenticated: no workbook fetch at all", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadSearchReadModel();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("missing_email: no workbook fetch at all", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: "u1" });
    const result = await loadSearchReadModel();
    expect(result).toEqual({ status: "missing_email" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("an email absent from כ\"א fails closed as unmapped", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u9",
      email: "stranger@example.invalid",
      avatarUrl: null,
    });
    const result = await loadSearchReadModel();
    expect(result).toEqual({ status: "unmapped" });
  });

  it("an email matching more than one כ\"א record fails closed as ambiguous_identity", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u9",
      email: "dup@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-12T08:00:00.000Z",
      sheets: [
        personnelSheet([
          ["שם", "מייל"],
          ["דני א", "dup@example.invalid"],
          ["דני ב", "dup@example.invalid"],
        ]),
        scheduleSheet([]),
        settingsSheet(SETTINGS_ROWS_VALID),
      ],
    });
    const result = await loadSearchReadModel();
    expect(result).toEqual({ status: "ambiguous_identity" });
  });

  it("an invalid/missing shift configuration fails closed as configuration_error", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-12T08:00:00.000Z",
      sheets: [personnelSheet(PERSONNEL_ROWS), scheduleSheet([]), settingsSheet([["הגדרה", "ערך"]])],
    });
    const result = await loadSearchReadModel();
    expect(result).toEqual({ status: "configuration_error" });
  });
});

describe("loadSearchReadModel — success", () => {
  it("requests exactly personnel+schedule+settings -- never potentialH1/H2", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    await loadSearchReadModel();
    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel", "schedule", "settings"]);
  });

  it("builds an ok SearchReadModel for the authenticated person", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    const result = await loadSearchReadModel();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.roster.map((p) => p.name)).toEqual(
        expect.arrayContaining(["דני בדיקה", "נועה דוגמה"]),
      );
    }
  });

  it("calls getRequestAuthenticatedIdentity -- the SAME request-scoped primitive personalSchedule.ts/managerWorkbookContext.ts use, never a second/different one", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    await loadSearchReadModel();
    expect(getRequestAuthenticatedIdentity).toHaveBeenCalledTimes(1);
  });
});
