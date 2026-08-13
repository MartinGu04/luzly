import { beforeEach, describe, expect, it, vi } from "vitest";

const loadManagerWorkbookContext = vi.fn();
const getManagerWorkbookSheet = vi.fn();
const getJerusalemLocalNow = vi.fn();

vi.mock("./managerWorkbookContext", () => ({ loadManagerWorkbookContext, getManagerWorkbookSheet }));
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));

const { loadManagerFairnessReadModel } = await import("./managerFairness");

const MANAGER = {
  id: "p_manager",
  name: "דני מנהל",
  email: "dani@example.invalid",
  isManager: true,
  isTechnician: false,
  isSupervisor: false,
  personnelType: null,
};

const FAIRNESS_HEADER = ["שם", "הקצאה", "ניקוד הפוטנציאל הקודם", "ניקוד לפוטנציאל הנוכחי", 'סופ"שים', "פטורים"];

function fairnessSheet(name: string, rows: string[][]) {
  return { name, values: [FAIRNESS_HEADER, ...rows] };
}

beforeEach(() => {
  loadManagerWorkbookContext.mockReset();
  getManagerWorkbookSheet.mockReset();
  getJerusalemLocalNow.mockReset();
  getJerusalemLocalNow.mockReturnValue({ date: "2026-08-13", minuteOfDay: 600 });
});

describe("loadManagerFairnessReadModel — auth pass-through", () => {
  it.each(["unauthenticated", "missing_email", "unmapped", "ambiguous_identity", "forbidden"])(
    "%s: passes through untouched",
    async (status) => {
      loadManagerWorkbookContext.mockResolvedValue({ status });
      const result = await loadManagerFairnessReadModel({ period: null, personId: null });
      expect(result).toEqual({ status });
      expect(getManagerWorkbookSheet).not.toHaveBeenCalled();
    },
  );

  it("configuration_error: message passed through", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "configuration_error", message: "bad config" });
    const result = await loadManagerFairnessReadModel({ period: null, personId: null });
    expect(result).toEqual({ status: "configuration_error", message: "bad config" });
  });
});

describe("loadManagerFairnessReadModel — period selection picks the right sheet", () => {
  it("h1 param selects potentialH1", async () => {
    loadManagerWorkbookContext.mockResolvedValue({
      status: "ok",
      context: { manager: MANAGER, people: [], snapshot: { fetchedAt: "2026-08-13T08:00:00.000Z", sheets: [] } },
    });
    getManagerWorkbookSheet.mockReturnValue(fairnessSheet('פוטנציאל תקש"אס 1-6/2026', []));

    await loadManagerFairnessReadModel({ period: "h1", personId: null });
    expect(getManagerWorkbookSheet).toHaveBeenCalledWith(expect.anything(), "potentialH1");
  });

  it("h2 param selects potentialH2", async () => {
    loadManagerWorkbookContext.mockResolvedValue({
      status: "ok",
      context: { manager: MANAGER, people: [], snapshot: { fetchedAt: "2026-08-13T08:00:00.000Z", sheets: [] } },
    });
    getManagerWorkbookSheet.mockReturnValue(fairnessSheet('פוטנציאל תקש"אס 7-12/2026', []));

    await loadManagerFairnessReadModel({ period: "h2", personId: null });
    expect(getManagerWorkbookSheet).toHaveBeenCalledWith(expect.anything(), "potentialH2");
  });

  it("invalid/missing period falls back to the period containing LocalNow (Aug -> h2)", async () => {
    loadManagerWorkbookContext.mockResolvedValue({
      status: "ok",
      context: { manager: MANAGER, people: [], snapshot: { fetchedAt: "2026-08-13T08:00:00.000Z", sheets: [] } },
    });
    getManagerWorkbookSheet.mockReturnValue(fairnessSheet('פוטנציאל תקש"אס 7-12/2026', []));

    const result = await loadManagerFairnessReadModel({ period: "bogus", personId: null });
    expect(getManagerWorkbookSheet).toHaveBeenCalledWith(expect.anything(), "potentialH2");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.model.period.key).toBe("h2");
  });
});

describe("loadManagerFairnessReadModel — never fetches Google itself, reuses the shared context", () => {
  it("builds a model from a real fairness table without a second fetch", async () => {
    loadManagerWorkbookContext.mockResolvedValue({
      status: "ok",
      context: {
        manager: MANAGER,
        people: [
          { id: "p_martin", name: "מרטין בדיקה", email: null, isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
        ],
        snapshot: { fetchedAt: "2026-08-13T08:00:00.000Z", sheets: [] },
      },
    });
    getManagerWorkbookSheet.mockReturnValue(
      fairnessSheet('פוטנציאל תקש"אס 7-12/2026', [
        ["מרטין בדיקה", "טכנאי", "5", "6", "2", ""],
        ["סך הכל:", "", "5", "6", "2", ""],
      ]),
    );

    const result = await loadManagerFairnessReadModel({ period: "h2", personId: null });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.model.rows).toHaveLength(1);
      expect(result.model.rows[0].currentScore).toBe(6);
      expect(result.model.manager.name).toBe("דני מנהל");
    }
    expect(loadManagerWorkbookContext).toHaveBeenCalledTimes(1);
  });

  it("never leaks the manager's email in the serialized result", async () => {
    loadManagerWorkbookContext.mockResolvedValue({
      status: "ok",
      context: { manager: MANAGER, people: [], snapshot: { fetchedAt: "2026-08-13T08:00:00.000Z", sheets: [] } },
    });
    getManagerWorkbookSheet.mockReturnValue(fairnessSheet('פוטנציאל תקש"אס 7-12/2026', []));

    const result = await loadManagerFairnessReadModel({ period: "h2", personId: null });
    expect(JSON.stringify(result)).not.toContain("dani@example.invalid");
  });
});
