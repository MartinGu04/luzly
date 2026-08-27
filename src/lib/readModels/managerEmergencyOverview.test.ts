import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import { stableIdFromName } from "@/lib/parsers/personnel";

const getWorkbookSnapshot = vi.fn();
const resolveOperationalRoster = vi.fn();
const getJerusalemLocalNow = vi.fn();

vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));
vi.mock("./operationalMode", () => ({ resolveOperationalRoster }));
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));

const { loadManagerEmergencyOverview } = await import("./managerEmergencyOverview");

function personnelSheet(rows: (string | boolean)[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}

function settingsSheet(shiftStartTimeDay: string | null): RawSheet {
  const rows: string[][] = [["הגדרה", "ערך"]];
  if (shiftStartTimeDay !== null) rows.push(["תחילת משמרת יום", shiftStartTimeDay]);
  return { name: "הגדרות", values: rows };
}

const PERSONNEL_ROWS: (string | boolean)[][] = [
  ["שם", "מייל", "מנהל"],
  ["דני מנהל", "manager@example.invalid", true],
  ["מרטין בדיקה", "martin@example.invalid", false],
];

function snapshot(shiftStartTimeDay: string | null = "07:00") {
  return {
    fetchedAt: "2026-08-13T08:00:00.000Z",
    sheets: [personnelSheet(PERSONNEL_ROWS), settingsSheet(shiftStartTimeDay)],
  };
}

const PERIOD = {
  id: "period1",
  activatedAt: "2026-08-13T08:00:00.000Z",
  activatedByUserId: "u_mgr",
  activatedByPersonId: "p_manager",
  activatedByPersonName: "דני מנהל",
  startDate: "2026-08-13",
  deactivatedAt: null,
  deactivatedByUserId: null,
  deactivatedByPersonId: null,
  deactivatedByPersonName: null,
  endDate: null,
};

const MANAGER = { id: "p_manager", name: "דני מנהל" };
const MARTIN_ID = stableIdFromName("מרטין בדיקה");

beforeEach(() => {
  getWorkbookSnapshot.mockReset();
  resolveOperationalRoster.mockReset();
  getJerusalemLocalNow.mockReset();
  getWorkbookSnapshot.mockResolvedValue(snapshot());
  // 2026-08-13 10:00 -- inside the day window for a 07:00 shift start.
  getJerusalemLocalNow.mockReturnValue({ date: "2026-08-13", minuteOfDay: 600 });
});

describe("loadManagerEmergencyOverview", () => {
  it("propagates emergency_unavailable without ever building an EmergencyScheduleReadModel", async () => {
    resolveOperationalRoster.mockResolvedValue({ mode: "emergency_unavailable", period: PERIOD, message: "boom" });

    const result = await loadManagerEmergencyOverview(MANAGER, null);

    expect(result).toEqual({ status: "emergency_unavailable", message: "boom" });
  });

  it("defaults to the 'all' perspective (whole-roster desk staffing) when no person is requested -- unlike /schedule's own default of 'self'", async () => {
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: PERIOD,
      assignments: [
        { date: "2026-08-13", period: "day", desk: "הוגוורט", personId: MARTIN_ID, personName: "מרטין בדיקה", sourceCell: "C2" },
      ],
      diagnostics: [],
      fetchedAt: "2026-08-13T09:00:00.000Z",
    });

    const result = await loadManagerEmergencyOverview(MANAGER, null);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.perspective).toBe("all");
    expect(result.model.everyoneShifts?.[0].desks.some((d) => d.personName === "מרטין בדיקה")).toBe(true);
  });

  it("'all' perspective resolves operationalOverview's current shift from the SAME assignments, using now=10:00/07:00-day-start -- the day shift", async () => {
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: PERIOD,
      assignments: [
        { date: "2026-08-13", period: "day", desk: "הוגוורט", personId: MARTIN_ID, personName: "מרטין בדיקה", sourceCell: "C2" },
      ],
      diagnostics: [],
      fetchedAt: "2026-08-13T09:00:00.000Z",
    });

    const result = await loadManagerEmergencyOverview(MANAGER, null);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.operationalOverview?.current).toMatchObject({ date: "2026-08-13", period: "day" });
    expect(result.operationalOverview?.current?.desks.some((d) => d.personName === "מרטין בדיקה")).toBe(true);
  });

  it("a requested personId narrows to that person's own desk assignments -- and operationalOverview is null (personal view instead)", async () => {
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: PERIOD,
      assignments: [
        { date: "2026-08-13", period: "day", desk: "הוגוורט", personId: MARTIN_ID, personName: "מרטין בדיקה", sourceCell: "C2" },
      ],
      diagnostics: [],
      fetchedAt: "2026-08-13T09:00:00.000Z",
    });

    const result = await loadManagerEmergencyOverview(MANAGER, MARTIN_ID);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.perspective).toBe("person");
    expect(result.model.selectedPersonId).toBe(MARTIN_ID);
    expect(result.model.personalShifts?.[0].ownDesks).toEqual(["הוגוורט"]);
    expect(result.operationalOverview).toBeNull();
  });

  it("an unknown personId falls back to the manager's own 'self' perspective, same fail-closed rule buildEmergencyScheduleReadModel already establishes", async () => {
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: PERIOD,
      assignments: [],
      diagnostics: [],
      fetchedAt: "2026-08-13T09:00:00.000Z",
    });

    const result = await loadManagerEmergencyOverview(MANAGER, "nonexistent_person_id");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.perspective).toBe("self");
    expect(result.operationalOverview).toBeNull();
  });

  it("throws if resolveOperationalRoster somehow reports 'regular' -- structurally unreachable within one request per its own docs", async () => {
    resolveOperationalRoster.mockResolvedValue({ mode: "regular" });

    await expect(loadManagerEmergencyOverview(MANAGER, null)).rejects.toThrow(/inconsistently/);
  });

  it("fetches personnel AND settings -- never the regular schedule/coverage sources", async () => {
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: PERIOD,
      assignments: [],
      diagnostics: [],
      fetchedAt: "2026-08-13T09:00:00.000Z",
    });

    await loadManagerEmergencyOverview(MANAGER, null);

    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel", "settings"]);
  });

  it("a broken shift-time configuration degrades operationalOverview gracefully (current/previous null) rather than throwing", async () => {
    getWorkbookSnapshot.mockResolvedValue(snapshot(null)); // no "תחילת משמרת יום" row at all
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: PERIOD,
      assignments: [
        { date: "2026-08-13", period: "day", desk: "הוגוורט", personId: MARTIN_ID, personName: "מרטין בדיקה", sourceCell: "C2" },
      ],
      diagnostics: [],
      fetchedAt: "2026-08-13T09:00:00.000Z",
    });

    const result = await loadManagerEmergencyOverview(MANAGER, null);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.operationalOverview?.current).toBeNull();
    expect(result.operationalOverview?.previous).toBeNull();
  });
});
