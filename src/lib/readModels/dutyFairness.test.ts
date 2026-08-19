import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";

const loadFairnessWorkbookContext = vi.fn();
const getJerusalemLocalNow = vi.fn();

vi.mock("./fairnessWorkbookContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fairnessWorkbookContext")>();
  return { ...actual, loadFairnessWorkbookContext };
});
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));

const { loadDutyFairnessReadModel } = await import("./dutyFairness");

const FAIRNESS_HEADER = ["שם", "הקצאה", "ניקוד הפוטנציאל הקודם", "ניקוד לפוטנציאל הנוכחי", 'סופ"שים', "פטורים"];

function fairnessSheet(name: string, rows: string[][]): RawSheet {
  return { name, values: [FAIRNESS_HEADER, ...rows] };
}

function person(overrides: Partial<Person> = {}): Person {
  return { id: "p_tech", name: "טל טכנאי", email: null, isManager: false, isTechnician: true, isSupervisor: false, personnelType: null, ...overrides };
}

function okContext(
  overrides: Partial<{
    people: Person[];
    h1Rows: string[][];
    h2Rows: string[][];
    scheduleRows: string[][];
    avatarByPersonId: ReadonlyMap<string, string | null>;
  }> = {},
) {
  const people = overrides.people ?? [person()];
  return {
    status: "ok" as const,
    context: {
      person: people[0],
      people,
      avatarByPersonId: overrides.avatarByPersonId ?? new Map<string, string | null>(),
      snapshot: {
        fetchedAt: "2026-08-15T10:00:00.000Z",
        sheets: [
          { name: 'כ"א', values: [] },
          {
            name: "משמרות + תורנויות",
            values: overrides.scheduleRows ? [["תאריך", "יום", ...people.map((p) => p.name)], ...overrides.scheduleRows] : [],
          },
          fairnessSheet('פוטנציאל תקש"אס 1-6/2026', overrides.h1Rows ?? []),
          fairnessSheet('פוטנציאל תקש"אס 7-12/2026', overrides.h2Rows ?? []),
        ],
      },
    },
  };
}

beforeEach(() => {
  loadFairnessWorkbookContext.mockReset();
  getJerusalemLocalNow.mockReset();
  getJerusalemLocalNow.mockReturnValue({ date: "2026-08-15", minuteOfDay: 600 });
});

describe("loadDutyFairnessReadModel — auth pass-through", () => {
  it.each(["unauthenticated", "missing_email", "unmapped", "ambiguous_identity"])("%s: passes through untouched", async (status) => {
    loadFairnessWorkbookContext.mockResolvedValue({ status });
    const result = await loadDutyFairnessReadModel(null);
    expect(result).toEqual({ status });
  });

});

describe("loadDutyFairnessReadModel — E. H1/H2 period selection", () => {
  it("h1 param selects the H1 Fairness table", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({ h1Rows: [["טל טכנאי", "טכנאי", "5", "6", "1", "-"]] }),
    );
    const result = await loadDutyFairnessReadModel("h1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.model.period.key).toBe("h1");
    const technicianGroup = result.model.groups.find((group) => group.key === "technician");
    expect(technicianGroup?.rows[0]?.currentScore).toBe(6);
  });

  it("h2 param selects the H2 Fairness table", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({ h2Rows: [["טל טכנאי", "טכנאי", "3", "4", "0", "-"]] }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.model.period.key).toBe("h2");
    const technicianGroup = result.model.groups.find((group) => group.key === "technician");
    expect(technicianGroup?.rows[0]?.currentScore).toBe(4);
  });

  it("an invalid/missing period falls back to the period containing now (h2 for August)", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    const result = await loadDutyFairnessReadModel(null);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.model.period.key).toBe("h2");
  });

  it("period status resolves via the shared foundation -- H1 of the current year is closed by August", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    const result = await loadDutyFairnessReadModel("h1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.model.period.status).toBe("closed");
  });
});

describe('loadDutyFairnessReadModel — ר"צ grouping preserved end-to-end', () => {
  it('a ר"צ row groups as supervisor with a null target, via the real, unmodified builder', async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        people: [person({ id: "p_ratz", name: "רוני רצ" })],
        h2Rows: [["רוני רצ", 'ר"צ', "5", "5", "1", "-"]],
      }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.model.groups.map((g) => g.key)).toEqual(["supervisor"]);
    const row = result.model.groups[0].rows[0];
    expect(row.currentScore).toBe(5);
    expect(row.comparisonTarget).toBeNull();
    expect(row.status).toBeNull();
  });
});

describe("loadDutyFairnessReadModel — avatar enrichment (never touches calculations)", () => {
  it("stamps each row's avatarUrl from the context's avatarByPersonId map, keyed by personId", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        h2Rows: [["טל טכנאי", "טכנאי", "5", "6", "1", "-"]],
        avatarByPersonId: new Map([["p_tech", "https://lh3.googleusercontent.com/a/tal.jpg"]]),
      }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((group) => group.key === "technician");
    expect(technicianGroup?.rows[0]?.avatarUrl).toBe("https://lh3.googleusercontent.com/a/tal.jpg");
  });

  it("falls back to null when the person has no entry in the map", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({ h2Rows: [["טל טכנאי", "טכנאי", "5", "6", "1", "-"]] }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((group) => group.key === "technician");
    expect(technicianGroup?.rows[0]?.avatarUrl).toBeNull();
  });

  it("an unresolved source name (personId: null) always gets avatarUrl: null, even if the map happens to have an entry under a coincidental key", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        h2Rows: [["מישהו לא ידוע", "טכנאי", "5", "6", "1", "-"]],
        avatarByPersonId: new Map([["p_tech", "https://lh3.googleusercontent.com/a/tal.jpg"]]),
      }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((group) => group.key === "technician");
    const unresolvedRow = technicianGroup?.rows.find((row) => row.personId === null);
    expect(unresolvedRow).toBeDefined();
    expect(unresolvedRow?.avatarUrl).toBeNull();
  });

  it("never leaks one person's photo onto a different person's row", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        people: [person(), person({ id: "p_ratz", name: "רוני רצ" })],
        h2Rows: [
          ["טל טכנאי", "טכנאי", "5", "6", "1", "-"],
          ["רוני רצ", 'ר"צ', "5", "5", "1", "-"],
        ],
        avatarByPersonId: new Map([
          ["p_tech", "https://lh3.googleusercontent.com/a/tal.jpg"],
          ["p_ratz", "https://lh3.googleusercontent.com/a/roni.jpg"],
        ]),
      }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const technicianRow = result.model.groups.find((g) => g.key === "technician")?.rows[0];
    const supervisorRow = result.model.groups.find((g) => g.key === "supervisor")?.rows[0];
    expect(technicianRow?.avatarUrl).toBe("https://lh3.googleusercontent.com/a/tal.jpg");
    expect(supervisorRow?.avatarUrl).toBe("https://lh3.googleusercontent.com/a/roni.jpg");
  });
});

describe("loadDutyFairnessReadModel — completedDutyCount: derived from the real schedule sheet, end-to-end", () => {
  it("counts confirmed guard-duty ('שומר 1') schedule entries for the row's own person, within the selected H1 period", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        h1Rows: [["טל טכנאי", "טכנאי", "5", "6", "1", "-"]],
        scheduleRows: [
          ["10/03/2026", "ג", "שומר 1"],
          ["15/04/2026", "ד", "שומר 1"],
        ],
      }),
    );
    const result = await loadDutyFairnessReadModel("h1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianRow = result.model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(technicianRow?.completedDutyCount).toBe(2);
    // A different, unrelated fact from the workbook's own weighted score.
    expect(technicianRow?.currentScore).toBe(6);
  });

  it("respects the selected period -- a duty dated in H2 is excluded while H1 is selected", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        h1Rows: [["טל טכנאי", "טכנאי", "5", "6", "1", "-"]],
        scheduleRows: [
          ["10/03/2026", "ג", "שומר 1"], // inside H1
          ["10/08/2026", "ב", "שומר 1"], // inside H2 -- must not count for H1
        ],
      }),
    );
    const result = await loadDutyFairnessReadModel("h1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianRow = result.model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(technicianRow?.completedDutyCount).toBe(1);
  });

  it("never counts a future duty -- NOW is mocked to 2026-08-15, so a schedule entry dated after that is excluded even inside the selected H2 period", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        h2Rows: [["טל טכנאי", "טכנאי", "3", "4", "0", "-"]],
        scheduleRows: [
          ["01/08/2026", "ש", "שומר 1"], // before NOW -- completed
          ["20/12/2026", "א", "שומר 1"], // after NOW -- still planned, not completed
        ],
      }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianRow = result.model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(technicianRow?.completedDutyCount).toBe(1);
  });

  it('a non-comparable person (\'ר"צ\', null target/status) still shows a real completed-duty count', async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        people: [person({ id: "p_ratz", name: "רוני רצ" })],
        h2Rows: [["רוני רצ", 'ר"צ', "5", "5", "1", "-"]],
        scheduleRows: [["10/08/2026", "ב", "שומר 1"]],
      }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const row = result.model.groups[0].rows[0];
    expect(row.status).toBeNull();
    expect(row.comparisonTarget).toBeNull();
    expect(row.completedDutyCount).toBe(1);
  });

  it("no schedule data at all -> a real 0, never null, for a resolved person", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext({ h2Rows: [["טל טכנאי", "טכנאי", "5", "6", "1", "-"]] }));
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianRow = result.model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(technicianRow?.completedDutyCount).toBe(0);
  });
});
