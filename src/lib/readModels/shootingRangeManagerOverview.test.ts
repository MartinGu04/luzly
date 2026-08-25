import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";

const loadManagerWorkbookContext = vi.fn();
const getJerusalemLocalNow = vi.fn();
const getCompletionsForPersonIds = vi.fn();
const getPlannedOccurrencesForPersonIds = vi.fn();

vi.mock("@/lib/readModels/managerWorkbookContext", async (importOriginal) => {
  // `getManagerWorkbookSheet` is kept REAL (a simple, pure name-lookup over
  // the snapshot the mocked `loadManagerWorkbookContext` below returns) --
  // only the actual auth/fetch boundary is mocked, same convention as
  // `managerOverview.test.ts`'s own dependency mocking.
  const actual = await importOriginal<typeof import("@/lib/readModels/managerWorkbookContext")>();
  return { ...actual, loadManagerWorkbookContext };
});
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));
vi.mock("@/lib/shootingRanges/store", () => ({ getCompletionsForPersonIds, getPlannedOccurrencesForPersonIds }));

const { loadShootingRangeManagerOverview } = await import("./shootingRangeManagerOverview");

function shootingRangesSheet(rows: (string | number)[][]): RawSheet {
  return { name: "מטווחים", values: rows };
}

function person(overrides: Partial<Person> = {}): Person {
  return { id: "p1", name: "דני עובד", email: "dani@example.invalid", isManager: false, isTechnician: false, isSupervisor: false, personnelType: null, ...overrides };
}

const MANAGER: Person = { id: "mgr1", name: "מנהל בדיקה", email: "mgr@example.invalid", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null };

function okContext(people: Person[], shootingRangesRows: (string | number)[][] = []) {
  return {
    status: "ok" as const,
    context: {
      manager: MANAGER,
      people,
      snapshot: { fetchedAt: "2026-08-25T08:00:00.000Z", sheets: [shootingRangesSheet(shootingRangesRows)] },
      avatarUrl: "https://photo",
    },
  };
}

describe("loadShootingRangeManagerOverview", () => {
  beforeEach(() => {
    loadManagerWorkbookContext.mockReset();
    getJerusalemLocalNow.mockReset();
    getCompletionsForPersonIds.mockReset();
    getPlannedOccurrencesForPersonIds.mockReset();

    getJerusalemLocalNow.mockReturnValue({ date: "2026-08-25", minuteOfDay: 600 });
    getCompletionsForPersonIds.mockResolvedValue([]);
    getPlannedOccurrencesForPersonIds.mockResolvedValue([]);
  });

  it("reuses loadManagerWorkbookContext narrowed to exactly [personnel, shootingRanges] -- never the full 5-source manager set", async () => {
    loadManagerWorkbookContext.mockResolvedValue(okContext([person()]));

    await loadShootingRangeManagerOverview();

    expect(loadManagerWorkbookContext).toHaveBeenCalledWith(["personnel", "shootingRanges"]);
  });

  it("passes through every non-ok manager-authorization status unchanged (unauthenticated/missing_email/unmapped/ambiguous_identity/forbidden)", async () => {
    for (const status of ["unauthenticated", "missing_email", "unmapped", "ambiguous_identity", "forbidden"] as const) {
      loadManagerWorkbookContext.mockResolvedValue({ status });
      const result = await loadShootingRangeManagerOverview();
      expect(result).toEqual({ status });
      expect(getCompletionsForPersonIds).not.toHaveBeenCalled();
    }
  });

  it("builds one qualification model per roster person, keyed by their OWN sheet baseline and completions", async () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const bob = person({ id: "p_bob", name: "בוב בדיקה" });
    loadManagerWorkbookContext.mockResolvedValue(
      okContext([alice, bob], [
        ["שם", "תאריך ביצוע מטווח"],
        ["אליס בדיקה", "29/06/2026"],
      ]),
    );

    const result = await loadShootingRangeManagerOverview();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const alicRow = result.model.rows.find((row) => row.personId === "p_alice");
    const bobRow = result.model.rows.find((row) => row.personId === "p_bob");
    expect(alicRow?.baselineDate).toBe("2026-06-29");
    expect(bobRow?.baselineDate).toBeNull();
    expect(bobRow?.status).toBe("none");
  });

  it("fetches completions/planned occurrences ONCE for the whole roster (bulk), not once per person", async () => {
    loadManagerWorkbookContext.mockResolvedValue(okContext([person({ id: "p1" }), person({ id: "p2" })]));

    await loadShootingRangeManagerOverview();

    expect(getCompletionsForPersonIds).toHaveBeenCalledTimes(1);
    expect(getCompletionsForPersonIds).toHaveBeenCalledWith(["p1", "p2"]);
    expect(getPlannedOccurrencesForPersonIds).toHaveBeenCalledTimes(1);
  });

  it("an approved app completion for one person never leaks into another person's row (per-person grouping is correct)", async () => {
    const alice = person({ id: "p_alice" });
    const bob = person({ id: "p_bob" });
    loadManagerWorkbookContext.mockResolvedValue(okContext([alice, bob]));
    getCompletionsForPersonIds.mockResolvedValue([
      {
        id: "c1",
        personId: "p_alice",
        performedOn: "2026-07-01",
        source: "manager_manual",
        status: "approved",
        notes: null,
        submittedByPersonId: "mgr1",
        submittedByPersonName: "מנהל בדיקה",
        approvedByPersonId: "mgr1",
        approvedByPersonName: "מנהל בדיקה",
        approvedAt: "2026-07-01T00:00:00.000Z",
        linkedPlannedDate: null,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);

    const result = await loadShootingRangeManagerOverview();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.rows.find((row) => row.personId === "p_alice")?.baselineDate).toBe("2026-07-01");
    expect(result.model.rows.find((row) => row.personId === "p_bob")?.baselineDate).toBeNull();
  });

  it("degrades gracefully when the מטווחים sheet has no recognizable header row -- every row falls back to no-baseline, never a crash", async () => {
    loadManagerWorkbookContext.mockResolvedValue(okContext([person()], [["הערות כלליות"], ["טקסט חופשי"]]));

    const result = await loadShootingRangeManagerOverview();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.rows[0].baselineDate).toBeNull();
    expect(result.model.summary.notQualifiedCount).toBe(1);
  });

  it("throws when the workbook snapshot is missing the מטווחים sheet entirely -- a genuine configuration problem, never silently ignored", async () => {
    loadManagerWorkbookContext.mockResolvedValue({
      status: "ok",
      context: { manager: MANAGER, people: [person()], snapshot: { fetchedAt: "2026-08-25T08:00:00.000Z", sheets: [] }, avatarUrl: null },
    });

    await expect(loadShootingRangeManagerOverview()).rejects.toThrow(/מטווחים/);
  });

  it("returns an empty, well-formed model for an empty roster -- never throws on zero people", async () => {
    loadManagerWorkbookContext.mockResolvedValue(okContext([]));

    const result = await loadShootingRangeManagerOverview();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.rows).toEqual([]);
    expect(result.model.summary).toEqual({ qualifiedCount: 0, nearingExpiryCount: 0, notQualifiedCount: 0, totalCount: 0 });
    expect(getCompletionsForPersonIds).toHaveBeenCalledWith([]);
  });
});
