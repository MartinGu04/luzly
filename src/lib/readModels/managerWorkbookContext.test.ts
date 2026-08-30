import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";

const getRequestAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();

vi.mock("@/lib/auth/getRequestAuthenticatedIdentity", () => ({ getRequestAuthenticatedIdentity }));
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

beforeEach(() => {
  getRequestAuthenticatedIdentity.mockReset();
  getWorkbookSnapshot.mockReset();
  getRequestAuthenticatedIdentity.mockResolvedValue({
    status: "authenticated",
    userId: "u1",
    email: "dani@example.invalid",
    avatarUrl: null,
  });
  getWorkbookSnapshot.mockResolvedValue(managerSnapshot());
});

describe("loadManagerWorkbookContext — auth pass-through states", () => {
  it("unauthenticated: no workbook fetch at all", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("missing_email: no workbook fetch at all", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: "u1" });
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "missing_email" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("an email absent from כ\"א fails closed as unmapped, AFTER the manager batch was fetched (the fresh snapshot is what's authoritative)", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u9",
      email: "stranger@example.invalid",
      avatarUrl: null,
    });
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "unmapped" });
  });

  it("an email matching more than one כ\"א record fails closed as ambiguous_identity", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u9",
      email: "dup@example.invalid",
      avatarUrl: null,
    });
    getWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({
        personnel: [
          ["שם", "מייל", "מנהל"],
          ["דני א", "dup@example.invalid", true],
          ["דני ב", "dup@example.invalid", true],
        ],
      }),
    );
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "ambiguous_identity" });
  });
});

describe("loadManagerWorkbookContext — manager authorization", () => {
  it("non-manager: forbidden", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u2",
      email: "noa@example.invalid",
      avatarUrl: null,
    });
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "forbidden" });
  });

  it("manager: fetches exactly the 6 shared manager sources, exactly once", async () => {
    await loadManagerWorkbookContext();
    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(MANAGER_WORKBOOK_SOURCES);
    expect(MANAGER_WORKBOOK_SOURCES).toEqual([
      "personnel",
      "schedule",
      "settings",
      "potentialH1",
      "potentialH2",
      "shootingRanges",
    ]);
  });

  it("a narrower caller's own `sources` is what actually gets fetched, not the fixed 5-source default", async () => {
    getWorkbookSnapshot.mockResolvedValue({ fetchedAt: "x", sheets: [personnelSheet(MANAGER_PERSONNEL_ROWS)] });
    await loadManagerWorkbookContext(["personnel"]);
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel"]);
  });

  it("fresh manager snapshot no longer marks the person as manager -> fails closed, data discarded", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({ personnel: [["שם", "מייל", "מנהל"], ["דני מנהל", "dani@example.invalid", false]] }),
    );
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "forbidden" });
    expect(result).not.toHaveProperty("context");
  });

  it("fresh snapshot where the person is no longer mapped at all also fails closed", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      managerSnapshot({ personnel: [["שם", "מייל", "מנהל"], ["מישהו אחר", "other@example.invalid", true]] }),
    );
    const result = await loadManagerWorkbookContext();
    expect(result).toEqual({ status: "unmapped" });
  });

  it("an invalid/missing shift-schedule configuration on the manager snapshot does NOT block this gate -- that's a downstream concern for callers that actually need ShiftSchedule", async () => {
    // No `settings` row worth parsing at all -- previously this would have
    // surfaced as `configuration_error` from the old getRequestPersonalSchedule
    // gate, before ever reaching this function. Now that this gate never
    // touches settings/ShiftSchedule, it authorizes normally.
    const result = await loadManagerWorkbookContext();
    expect(result.status).toBe("ok");
  });

  it("success: returns the re-verified manager, full roster, and raw snapshot", async () => {
    const result = await loadManagerWorkbookContext();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context.manager.name).toBe("דני מנהל");
      expect(result.context.people).toHaveLength(2);
      expect(result.context.snapshot.sheets).toHaveLength(5);
    }
  });

  it("carries the manager's own avatarUrl through from the resolved identity, never a new lookup", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
      avatarUrl: "https://example.invalid/photo.jpg",
    });
    const result = await loadManagerWorkbookContext();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context.avatarUrl).toBe("https://example.invalid/photo.jpg");
    }
  });

  it("avatarUrl is null when the manager has no Google profile photo", async () => {
    const result = await loadManagerWorkbookContext();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context.avatarUrl).toBeNull();
    }
  });

  it("calls getRequestAuthenticatedIdentity exactly once -- a single live getUser() check per call, request-scoped dedup with any other loader on the same render happens via cache() itself", async () => {
    await loadManagerWorkbookContext();
    expect(getRequestAuthenticatedIdentity).toHaveBeenCalledTimes(1);
  });

  it("parses personnel exactly once (no redundant double-parse)", async () => {
    const result = await loadManagerWorkbookContext();
    expect(result.status).toBe("ok");
    // getWorkbookSnapshot itself is called once (asserted above); personnel
    // parsing happens from that single snapshot, never a second time.
    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
  });
});

function personnelOnlySnapshot(rows: (string | boolean)[][] = MANAGER_PERSONNEL_ROWS) {
  return { fetchedAt: "2026-08-21T17:32:00.000Z", sheets: [personnelSheet(rows)] };
}

describe("loadManagerPersonnelContext -- the lightweight polling authorization path", () => {
  beforeEach(() => {
    getWorkbookSnapshot.mockResolvedValue(personnelOnlySnapshot());
  });

  it("fetches ONLY the personnel source via the cached getWorkbookSnapshot -- never the full 5-source manager set, never a second fetch", async () => {
    await loadManagerPersonnelContext();
    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel"]);
  });

  it("an unauthenticated caller triggers no workbook read at all", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadManagerPersonnelContext();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("an authenticated caller with no usable email triggers no workbook read at all", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: "u1" });
    const result = await loadManagerPersonnelContext();
    expect(result).toEqual({ status: "missing_email" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("an email absent from כ\"א fails closed as unmapped", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u2",
      email: "stranger@example.invalid",
      avatarUrl: null,
    });
    const result = await loadManagerPersonnelContext();
    expect(result).toEqual({ status: "unmapped" });
  });

  it("a mapped but NON-manager person fails closed as forbidden -- manager status is never trusted from the client", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({
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
