import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";

const getRequestPersonalSchedule = vi.fn();
const getAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();
const fetchEmailToAvatarUrl = vi.fn();
const resolveAvatarUrlsByPersonId = vi.fn();

vi.mock("./getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));
vi.mock("./fairnessAvatarLookup", () => ({ fetchEmailToAvatarUrl, resolveAvatarUrlsByPersonId }));

const { loadFairnessWorkbookContext, getFairnessWorkbookSheet, FAIRNESS_WORKBOOK_SOURCES } = await import(
  "./fairnessWorkbookContext"
);

function personnelSheet(rows: (string | boolean)[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}
function scheduleSheet(rows: (string | number)[][]): RawSheet {
  return { name: "משמרות + תורנויות", values: rows };
}
function potentialSheet(name: string, rows: (string | number)[][]): RawSheet {
  return { name, values: rows };
}

const PERSONNEL_ROWS: (string | boolean)[][] = [
  ["שם", "מייל", "מנהל"],
  ["דני מנהל", "dani@example.invalid", true],
  ["נועה עובדת", "noa@example.invalid", false],
];

function fairnessSnapshot(overrides: Partial<{ personnel: (string | boolean)[][] }> = {}) {
  return {
    fetchedAt: "2026-08-13T08:00:00.000Z",
    sheets: [
      personnelSheet(overrides.personnel ?? PERSONNEL_ROWS),
      scheduleSheet([]),
      potentialSheet('פוטנציאל תקש"אס 1-6/2026', []),
      potentialSheet('פוטנציאל תקש"אס 7-12/2026', []),
    ],
  };
}

function okPersonalResult() {
  return {
    status: "ok" as const,
    model: {
      person: { id: "p_dani", name: "דני מנהל", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
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
  fetchEmailToAvatarUrl.mockReset();
  resolveAvatarUrlsByPersonId.mockReset();
  getAuthenticatedIdentity.mockResolvedValue({ status: "ok", email: "dani@example.invalid", avatarUrl: null });
  getWorkbookSnapshot.mockResolvedValue(fairnessSnapshot());
  fetchEmailToAvatarUrl.mockResolvedValue(new Map());
  resolveAvatarUrlsByPersonId.mockReturnValue(new Map());
});

describe("loadFairnessWorkbookContext — A. non-manager-only access", () => {
  it.each(["unauthenticated", "missing_email", "unmapped", "ambiguous_identity"])(
    "%s: passes through untouched, never fetches the Fairness workbook",
    async (status) => {
      getRequestPersonalSchedule.mockResolvedValue({ status });
      const result = await loadFairnessWorkbookContext();
      expect(result).toEqual({ status });
      expect(getWorkbookSnapshot).not.toHaveBeenCalled();
    },
  );

  it("a mapped NON-manager is allowed -- status ok, no forbidden/manager gate anywhere in this loader", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult());
    getAuthenticatedIdentity.mockResolvedValue({ status: "ok", email: "noa@example.invalid", avatarUrl: null });

    const result = await loadFairnessWorkbookContext();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context.person.name).toBe("נועה עובדת");
      expect(result.context.person.isManager).toBe(false);
    }
  });

  it("a mapped manager is also allowed", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult());
    getAuthenticatedIdentity.mockResolvedValue({ status: "ok", email: "dani@example.invalid", avatarUrl: null });

    const result = await loadFairnessWorkbookContext();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context.person.isManager).toBe(true);
    }
  });
});

describe("loadFairnessWorkbookContext — configuration_error does not block Fairness (Fairness never depends on shift-schedule config)", () => {
  it("a Personal Schedule configuration_error does NOT stop the Fairness workbook fetch", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "bad shift-start config",
      person: { id: "p_dani", name: "דני מנהל", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
      avatarUrl: null,
    });
    getAuthenticatedIdentity.mockResolvedValue({ status: "ok", email: "dani@example.invalid", avatarUrl: null });

    const result = await loadFairnessWorkbookContext();
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel", "schedule", "potentialH1", "potentialH2"]);
    expect(result.status).toBe("ok");
  });

  it("a successfully re-verified mapped person still receives real Fairness data after a configuration_error", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "bad shift-start config",
      person: { id: "p_noa", name: "נועה עובדת", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
      avatarUrl: null,
    });
    getAuthenticatedIdentity.mockResolvedValue({ status: "ok", email: "noa@example.invalid", avatarUrl: null });

    const result = await loadFairnessWorkbookContext();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context.person.name).toBe("נועה עובדת");
      expect(result.context.people.length).toBeGreaterThan(0);
    }
  });

  it("configuration_error + a second-pass identity that no longer resolves still fails closed as unmapped", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "bad shift-start config",
      person: { id: "p_dani", name: "דני מנהל", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
      avatarUrl: null,
    });
    getAuthenticatedIdentity.mockResolvedValue({ status: "ok", email: "gone@example.invalid", avatarUrl: null });

    const result = await loadFairnessWorkbookContext();
    expect(result).toEqual({ status: "unmapped" });
  });

  it("configuration_error + a second-pass ambiguous identity still fails closed", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "bad shift-start config",
      person: { id: "p_dani", name: "דני מנהל", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue(
      fairnessSnapshot({
        personnel: [
          ["שם", "מייל", "מנהל"],
          ["דני א", "dup@example.invalid", false],
          ["דני ב", "dup@example.invalid", false],
        ],
      }),
    );
    getAuthenticatedIdentity.mockResolvedValue({ status: "ok", email: "dup@example.invalid", avatarUrl: null });

    const result = await loadFairnessWorkbookContext();
    expect(result).toEqual({ status: "ambiguous_identity" });
  });

  it("normal auth failures (unauthenticated/missing_email/unmapped/ambiguous_identity) still never expose Fairness data or trigger a fetch", async () => {
    for (const status of ["unauthenticated", "missing_email", "unmapped", "ambiguous_identity"] as const) {
      getWorkbookSnapshot.mockClear();
      getRequestPersonalSchedule.mockResolvedValue({ status });
      const result = await loadFairnessWorkbookContext();
      expect(result).toEqual({ status });
      expect(getWorkbookSnapshot).not.toHaveBeenCalled();
    }
  });
});

describe("loadFairnessWorkbookContext — source set + caching", () => {
  it("requests exactly personnel, schedule, potentialH1, potentialH2 -- never settings", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult());
    await loadFairnessWorkbookContext();
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel", "schedule", "potentialH1", "potentialH2"]);
  });

  it("FAIRNESS_WORKBOOK_SOURCES is the same fixed set, used identically regardless of caller/mode", () => {
    expect(FAIRNESS_WORKBOOK_SOURCES).toEqual(["personnel", "schedule", "potentialH1", "potentialH2"]);
  });
});

describe("loadFairnessWorkbookContext — defense in depth re-verification", () => {
  it("fails closed as unmapped if the fresh snapshot's personnel no longer resolves the identity", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult());
    getAuthenticatedIdentity.mockResolvedValue({ status: "ok", email: "gone@example.invalid", avatarUrl: null });

    const result = await loadFairnessWorkbookContext();
    expect(result).toEqual({ status: "unmapped" });
  });

  it("fails closed as ambiguous_identity if the fresh snapshot has a duplicate email match", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult());
    getWorkbookSnapshot.mockResolvedValue(
      fairnessSnapshot({
        personnel: [
          ["שם", "מייל", "מנהל"],
          ["דני א", "dup@example.invalid", false],
          ["דני ב", "dup@example.invalid", false],
        ],
      }),
    );
    getAuthenticatedIdentity.mockResolvedValue({ status: "ok", email: "dup@example.invalid", avatarUrl: null });

    const result = await loadFairnessWorkbookContext();
    expect(result).toEqual({ status: "ambiguous_identity" });
  });
});

describe("loadFairnessWorkbookContext — avatar resolution", () => {
  it("passes the resolved people + avatar map through to avatarByPersonId", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult());
    const emailMap = new Map([["dani@example.invalid", "https://lh3.googleusercontent.com/a/dani.jpg"]]);
    const personMap = new Map([["p_dani", "https://lh3.googleusercontent.com/a/dani.jpg"]]);
    fetchEmailToAvatarUrl.mockResolvedValue(emailMap);
    resolveAvatarUrlsByPersonId.mockReturnValue(personMap);

    const result = await loadFairnessWorkbookContext();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(resolveAvatarUrlsByPersonId).toHaveBeenCalledWith(result.context.people, emailMap);
    expect(result.context.avatarByPersonId).toBe(personMap);
  });

  it("degrades to an empty avatar map (never fails the whole page) when the bulk lookup rejects", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okPersonalResult());
    fetchEmailToAvatarUrl.mockRejectedValue(new Error("Admin API unavailable"));

    const result = await loadFairnessWorkbookContext();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.context.avatarByPersonId).toEqual(new Map());
  });

  it("never fetches avatars at all for an early auth failure (unauthenticated/missing_email/unmapped/ambiguous_identity)", async () => {
    for (const status of ["unauthenticated", "missing_email", "unmapped", "ambiguous_identity"] as const) {
      fetchEmailToAvatarUrl.mockClear();
      getRequestPersonalSchedule.mockResolvedValue({ status });
      await loadFairnessWorkbookContext();
      expect(fetchEmailToAvatarUrl).not.toHaveBeenCalled();
    }
  });
});

describe("getFairnessWorkbookSheet", () => {
  it("finds a sheet by its logical source key", () => {
    const snapshot = fairnessSnapshot();
    const sheet = getFairnessWorkbookSheet(snapshot, "personnel");
    expect(sheet.name).toBe('כ"א');
  });

  it("throws (never silently returns undefined) for a missing sheet", () => {
    const snapshot = { fetchedAt: "2026-08-13T08:00:00.000Z", sheets: [] };
    expect(() => getFairnessWorkbookSheet(snapshot, "personnel")).toThrow();
  });
});
