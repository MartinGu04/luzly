import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";

const getAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();
const getJerusalemLocalNow = vi.fn();
const resolveOperationalRoster = vi.fn();

vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));
vi.mock("./operationalMode", () => ({ resolveOperationalRoster }));

const { loadPersonalScheduleReadModel } = await import("./personalSchedule");

function personnelSheet(rows: string[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}

function scheduleSheet(rows: (string | number)[][]): RawSheet {
  return { name: "משמרות + תורנויות", values: rows };
}

function settingsSheet(rows: string[][]): RawSheet {
  return { name: "הגדרות", values: rows };
}

function potentialH1Sheet(rows: (string | number)[][]): RawSheet {
  return { name: 'פוטנציאל תקש"אס 1-6/2026', values: rows };
}

function potentialH2Sheet(rows: (string | number)[][]): RawSheet {
  return { name: 'פוטנציאל תקש"אס 7-12/2026', values: rows };
}

const PERSONNEL_ROWS: string[][] = [
  ["שם", "מייל"],
  ["דני בדיקה", "dani@example.invalid"],
];

const SETTINGS_ROWS_VALID: string[][] = [
  ["הגדרה", "ערך"],
  ["תחילת משמרת יום", "07:30"],
];

function validSnapshot() {
  return {
    fetchedAt: "2026-08-12T08:00:00.000Z",
    sheets: [
      scheduleSheet([]),
      settingsSheet(SETTINGS_ROWS_VALID),
      personnelSheet(PERSONNEL_ROWS),
      potentialH1Sheet([]),
      potentialH2Sheet([]),
    ],
  };
}

describe("loadPersonalScheduleReadModel", () => {
  beforeEach(() => {
    getAuthenticatedIdentity.mockReset();
    getWorkbookSnapshot.mockReset();
    getJerusalemLocalNow.mockReset();
    getJerusalemLocalNow.mockReturnValue({ date: "2026-08-12", minuteOfDay: 600 });
    resolveOperationalRoster.mockReset();
    resolveOperationalRoster.mockResolvedValue({ mode: "regular" });
  });

  it("8. returns unauthenticated without fetching anything", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadPersonalScheduleReadModel();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("9. returns missing_email without fetching anything", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: "u1" });
    const result = await loadPersonalScheduleReadModel();
    expect(result).toEqual({ status: "missing_email" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("1 & 2. requests personnel + schedule + settings + potentialH1 + potentialH2, in a single batch call", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue(validSnapshot());

    await loadPersonalScheduleReadModel();

    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(getWorkbookSnapshot).toHaveBeenCalledWith([
      "personnel",
      "schedule",
      "settings",
      "potentialH1",
      "potentialH2",
    ]);
  });

  it("3. requests both Potential periods -- so a person whose duties only exist in a תקשא\"ס source still gets them, without a second Google request", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue(validSnapshot());

    await loadPersonalScheduleReadModel();

    const requestedKeys = getWorkbookSnapshot.mock.calls[0][0];
    expect(requestedKeys).toContain("potentialH1");
    expect(requestedKeys).toContain("potentialH2");
  });

  it("4 & 5. unique authenticated email resolves the Person and builds a model", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue(validSnapshot());

    const result = await loadPersonalScheduleReadModel();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.person.name).toBe("דני בדיקה");
      expect(result.model.localNow).toEqual({ date: "2026-08-12", minuteOfDay: 600 });
    }
  });

  it("6. an unmapped email produces no read model", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "stranger@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue(validSnapshot());

    const result = await loadPersonalScheduleReadModel();
    expect(result).toEqual({ status: "unmapped" });
  });

  it("7. a duplicate personnel email produces no read model", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "shared@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-12T08:00:00.000Z",
      sheets: [
        scheduleSheet([]),
        settingsSheet(SETTINGS_ROWS_VALID),
        personnelSheet([
          ["שם", "מייל"],
          ["דני בדיקה", "shared@example.invalid"],
          ["נועה דוגמה", "SHARED@example.invalid"],
        ]),
      ],
    });

    const result = await loadPersonalScheduleReadModel();
    expect(result).toEqual({ status: "ambiguous_identity" });
  });

  it("does not fetch/parse a personal schedule for a non-ok identity result", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "stranger@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue(validSnapshot());

    const result = await loadPersonalScheduleReadModel();
    expect(result).not.toHaveProperty("model");
  });

  it("45. an invalid/missing shift configuration fails closed as configuration_error, never a default", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-12T08:00:00.000Z",
      sheets: [scheduleSheet([]), settingsSheet([["הגדרה", "ערך"]]), personnelSheet(PERSONNEL_ROWS)],
    });

    const result = await loadPersonalScheduleReadModel();
    expect(result.status).toBe("configuration_error");
  });

  it("a duty attributed via a תקשא\"ס period source (no matching internal Event at all) reaches dutyBlocks end-to-end", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-12T08:00:00.000Z",
      sheets: [
        scheduleSheet([]),
        settingsSheet(SETTINGS_ROWS_VALID),
        personnelSheet(PERSONNEL_ROWS),
        potentialH1Sheet([]),
        potentialH2Sheet([
          ["תאריך", "יום", "שומר 1"],
          ["20/08/2026", "ה", "דני בדיקה"],
        ]),
      ],
    });

    const result = await loadPersonalScheduleReadModel();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.dutyBlocks).toEqual([
        expect.objectContaining({
          dutyFamily: "guard",
          slot: 1,
          startDate: "2026-08-20",
          endDate: "2026-08-20",
          certainty: "tentative",
        }),
      ]);
    }
  });

  it("10. the authenticated person's email is not present in the serialized result", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue(validSnapshot());

    const result = await loadPersonalScheduleReadModel();
    expect(JSON.stringify(result)).not.toContain("dani@example.invalid");
  });
});

describe("loadPersonalScheduleReadModel — avatarUrl (presentation-only, sourced only from the auth identity)", () => {
  beforeEach(() => {
    getAuthenticatedIdentity.mockReset();
    getWorkbookSnapshot.mockReset();
    getJerusalemLocalNow.mockReset();
    getJerusalemLocalNow.mockReturnValue({ date: "2026-08-12", minuteOfDay: 600 });
    resolveOperationalRoster.mockReset();
    resolveOperationalRoster.mockResolvedValue({ mode: "regular" });
  });

  it("carries the identity's avatarUrl straight through on an 'ok' result", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: "https://lh3.googleusercontent.com/a/photo.jpg",
    });
    getWorkbookSnapshot.mockResolvedValue(validSnapshot());

    const result = await loadPersonalScheduleReadModel();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.avatarUrl).toBe("https://lh3.googleusercontent.com/a/photo.jpg");
    }
  });

  it("is null on an 'ok' result when the identity had no avatarUrl -- never undefined, never a crash", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue(validSnapshot());

    const result = await loadPersonalScheduleReadModel();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.avatarUrl).toBeNull();
    }
  });

  it("also carries through on a configuration_error result, alongside the resolved identity", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: "https://lh3.googleusercontent.com/a/photo.jpg",
    });
    getWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-12T08:00:00.000Z",
      sheets: [scheduleSheet([]), settingsSheet([["הגדרה", "ערך"]]), personnelSheet(PERSONNEL_ROWS)],
    });

    const result = await loadPersonalScheduleReadModel();

    expect(result.status).toBe("configuration_error");
    if (result.status === "configuration_error") {
      expect(result.avatarUrl).toBe("https://lh3.googleusercontent.com/a/photo.jpg");
    }
  });

  it("avatarUrl never influences identity matching -- an unmapped email is still unmapped regardless of avatarUrl", async () => {
    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "stranger@example.invalid",
      avatarUrl: "https://lh3.googleusercontent.com/a/photo.jpg",
    });
    getWorkbookSnapshot.mockResolvedValue(validSnapshot());

    const result = await loadPersonalScheduleReadModel();
    expect(result).toEqual({ status: "unmapped" });
  });
});

describe("loadPersonalScheduleReadModel — Emergency Mode", () => {
  beforeEach(() => {
    getAuthenticatedIdentity.mockReset();
    getWorkbookSnapshot.mockReset();
    getJerusalemLocalNow.mockReset();
    getJerusalemLocalNow.mockReturnValue({ date: "2026-08-12", minuteOfDay: 600 });
    resolveOperationalRoster.mockReset();

    getAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: null,
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    getWorkbookSnapshot.mockResolvedValue(validSnapshot());
  });

  it("returns status 'emergency' with the built EmergencyPersonalHomeReadModel when the roster is available, never the regular model", async () => {
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: {
        id: "period1",
        activatedAt: "2026-08-12T08:00:00.000Z",
        activatedByUserId: "u_mgr",
        activatedByPersonId: "p_mgr",
        activatedByPersonName: "מנהל בדיקה",
        startDate: "2026-08-12",
        deactivatedAt: null,
        deactivatedByUserId: null,
        deactivatedByPersonId: null,
        deactivatedByPersonName: null,
        endDate: null,
      },
      assignments: [],
      diagnostics: [],
      fetchedAt: "2026-08-12T09:00:00.000Z",
    });

    const result = await loadPersonalScheduleReadModel();

    expect(result.status).toBe("emergency");
    if (result.status !== "emergency") throw new Error("unreachable");
    expect(result.person.name).toBe("דני בדיקה");
    expect(result.emergencyHome.period.id).toBe("period1");
    expect(result.emergencyHome.fetchedAt).toBe("2026-08-12T09:00:00.000Z");
  });

  it("returns status 'emergency_unavailable' (never falls back to regular data) when the emergency roster is unreadable", async () => {
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency_unavailable",
      period: {
        id: "period1",
        activatedAt: "2026-08-12T08:00:00.000Z",
        activatedByUserId: "u_mgr",
        activatedByPersonId: "p_mgr",
        activatedByPersonName: "מנהל בדיקה",
        startDate: "2026-08-12",
        deactivatedAt: null,
        deactivatedByUserId: null,
        deactivatedByPersonId: null,
        deactivatedByPersonName: null,
        endDate: null,
      },
      message: "Missing Google Sheets configuration: GOOGLE_EMERGENCY_SPREADSHEET_ID.",
    });

    const result = await loadPersonalScheduleReadModel();

    expect(result.status).toBe("emergency_unavailable");
    if (result.status !== "emergency_unavailable") throw new Error("unreachable");
    expect(result.person.name).toBe("דני בדיקה");
  });

  it("a broken regular shift-time configuration does not block the emergency view -- best-effort schedule is used, never a hard failure", async () => {
    getWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-12T08:00:00.000Z",
      sheets: [scheduleSheet([]), settingsSheet([["הגדרה", "ערך"]]), personnelSheet(PERSONNEL_ROWS), potentialH1Sheet([]), potentialH2Sheet([])],
    });
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: {
        id: "period1",
        activatedAt: "2026-08-12T08:00:00.000Z",
        activatedByUserId: "u_mgr",
        activatedByPersonId: "p_mgr",
        activatedByPersonName: "מנהל בדיקה",
        startDate: "2026-08-12",
        deactivatedAt: null,
        deactivatedByUserId: null,
        deactivatedByPersonId: null,
        deactivatedByPersonName: null,
        endDate: null,
      },
      assignments: [],
      diagnostics: [],
      fetchedAt: "2026-08-12T09:00:00.000Z",
    });

    const result = await loadPersonalScheduleReadModel();

    expect(result.status).toBe("emergency");
  });
});
