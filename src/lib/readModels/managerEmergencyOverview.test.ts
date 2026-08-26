import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import { stableIdFromName } from "@/lib/parsers/personnel";

const getWorkbookSnapshot = vi.fn();
const resolveOperationalRoster = vi.fn();

vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));
vi.mock("./operationalMode", () => ({ resolveOperationalRoster }));

const { loadManagerEmergencyOverview } = await import("./managerEmergencyOverview");

function personnelSheet(rows: (string | boolean)[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}

const PERSONNEL_ROWS: (string | boolean)[][] = [
  ["שם", "מייל", "מנהל"],
  ["דני מנהל", "manager@example.invalid", true],
  ["מרטין בדיקה", "martin@example.invalid", false],
];

function snapshot() {
  return { fetchedAt: "2026-08-13T08:00:00.000Z", sheets: [personnelSheet(PERSONNEL_ROWS)] };
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
  getWorkbookSnapshot.mockResolvedValue(snapshot());
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

  it("a requested personId narrows to that person's own desk assignments", async () => {
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
  });

  it("throws if resolveOperationalRoster somehow reports 'regular' -- structurally unreachable within one request per its own docs", async () => {
    resolveOperationalRoster.mockResolvedValue({ mode: "regular" });

    await expect(loadManagerEmergencyOverview(MANAGER, null)).rejects.toThrow(/inconsistently/);
  });

  it("never fetches the regular schedule/coverage sources -- only a personnel-only snapshot", async () => {
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: PERIOD,
      assignments: [],
      diagnostics: [],
      fetchedAt: "2026-08-13T09:00:00.000Z",
    });

    await loadManagerEmergencyOverview(MANAGER, null);

    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel"]);
  });
});
