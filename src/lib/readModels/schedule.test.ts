import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { ScheduleParams } from "./schedule";

const getRequestPersonalSchedule = vi.fn();
const getAuthenticatedIdentity = vi.fn();
const fetchRawWorkbookSnapshot = vi.fn();

vi.mock("./getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/google", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google")>("@/lib/google");
  return { ...actual, fetchRawWorkbookSnapshot };
});

const { loadScheduleReadModel } = await import("./schedule");

function personnelSheet(rows: (string | boolean)[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}
function scheduleSheet(rows: (string | number)[][]): RawSheet {
  return { name: "משמרות + תורנויות", values: rows };
}
function settingsSheet(rows: string[][]): RawSheet {
  return { name: "הגדרות", values: rows };
}

const MANAGER_PERSONNEL_ROWS: (string | boolean)[][] = [
  ["שם", "מייל", "מנהל"],
  ["מרטין גוסין", "martin@example.invalid", true],
  ["דניאל כהן", "daniel@example.invalid", false],
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
    ],
  };
}

function okPersonalResult(isManager: boolean) {
  return {
    status: "ok" as const,
    model: {
      person: {
        id: "p_martin",
        name: "מרטין גוסין",
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

const DEFAULT_PARAMS: ScheduleParams = { rawMonth: null, personId: null };

beforeEach(() => {
  getRequestPersonalSchedule.mockReset();
  getAuthenticatedIdentity.mockReset();
  fetchRawWorkbookSnapshot.mockReset();
  getAuthenticatedIdentity.mockResolvedValue({
    status: "authenticated",
    userId: "u1",
    email: "martin@example.invalid",
    avatarUrl: null,
  });
  fetchRawWorkbookSnapshot.mockResolvedValue(managerSnapshot());
});

describe("loadScheduleReadModel — auth pass-through states", () => {
  it("unauthenticated: no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "unauthenticated" });
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("missing_email: no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "missing_email" });
    const result = await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "missing_email" });
  });

  it("unmapped: no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unmapped" });
    const result = await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "unmapped" });
  });

  it("ambiguous_identity: no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "ambiguous_identity" });
    const result = await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "ambiguous_identity" });
  });

  it("configuration_error from the personal loader passes the message through, no manager fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "Missing shift start time configuration.",
      person: { id: "p_1", name: "מרטין גוסין", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
    });
    const result = await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(result).toEqual({ status: "configuration_error", message: "Missing shift start time configuration." });
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
  });
});

describe("loadScheduleReadModel — normal (non-manager) user (PR #24 §3)", () => {
  it("never fetches manager-wide data, always returns self, ignores any requested person", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(false));
    const result = await loadScheduleReadModel({ rawMonth: null, personId: "all" });
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.manager).toBeNull();
      expect(result.model.roster).toEqual([]);
      expect(result.model.perspective).toBe("self");
    }
  });

  it("still returns self even when a specific colleague id is requested", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(false));
    const result = await loadScheduleReadModel({ rawMonth: null, personId: "p_someone_else" });
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.perspective).toBe("self");
      expect(result.model.manager).toBeNull();
    }
  });
});

describe("loadScheduleReadModel — manager authorization / fetch scope (PR #24 §25/§26)", () => {
  it("manager: fetches exactly personnel+schedule+settings -- never potentialH1/H2", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledWith(["personnel", "schedule", "settings"]);
  });

  it("a normal user only ever calls getRequestPersonalSchedule once", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(false));
    await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(getRequestPersonalSchedule).toHaveBeenCalledTimes(1);
  });

  it("a manager's request calls getRequestPersonalSchedule from two call sites (here, and again inside loadManagerWorkbookContext) -- both share ONE real request-scoped result via React's cache() in production, this mock just can't demonstrate that dedup itself", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(getRequestPersonalSchedule).toHaveBeenCalledTimes(2);
  });

  it("a non-manager never triggers the manager-wide fetch either, even via this loader's manager branch check", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(false));
    await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(fetchRawWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("fresh manager snapshot no longer marks the person as manager -> fails closed to the self-only experience, not an error page", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    fetchRawWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({
        personnel: [
          ["שם", "מייל", "מנהל"],
          ["מרטין גוסין", "martin@example.invalid", false],
        ],
      }),
    );
    const result = await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.manager).toBeNull();
      expect(result.model.perspective).toBe("self");
    }
  });

  it("an invalid/missing shift configuration in the manager fetch fails closed as configuration_error", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    fetchRawWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-13T08:00:00.000Z",
      sheets: [personnelSheet(MANAGER_PERSONNEL_ROWS), scheduleSheet([]), settingsSheet([["הגדרה", "ערך"]])],
    });
    const result = await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(result.status).toBe("configuration_error");
  });
});

describe("loadScheduleReadModel — success / privacy", () => {
  it("builds an ok ScheduleReadModel for an authorized manager, defaulting to self", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    const result = await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.manager?.name).toBe("מרטין גוסין");
      expect(result.model.perspective).toBe("self");
      expect(result.model.roster).toHaveLength(1);
    }
  });

  it("resolves an explicit month param for the everyone perspective's scoped data", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    const result = await loadScheduleReadModel({ rawMonth: "2026-02", personId: "all" });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.perspective).toBe("all");
    }
  });

  it("falls back to the current month for an invalid month param, never crashes", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    const result = await loadScheduleReadModel({ rawMonth: "not-a-month", personId: "all" });
    expect(result.status).toBe("ok");
  });

  it("does not leak the manager's own email anywhere in the serialized result", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    const result = await loadScheduleReadModel(DEFAULT_PARAMS);
    expect(JSON.stringify(result)).not.toContain("martin@example.invalid");
  });

  it("does not leak a colleague's email anywhere in the serialized roster/personal result", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult(true));
    const result = await loadScheduleReadModel({ rawMonth: null, personId: "all" });
    expect(JSON.stringify(result)).not.toContain("daniel@example.invalid");
    expect(JSON.stringify(result)).not.toContain("@example.invalid");
  });
});
