import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";

const loadFairnessWorkbookContext = vi.fn();
const getJerusalemLocalNow = vi.fn();
const getEmergencyDateSet = vi.fn();
const resolveOperationalMode = vi.fn();

vi.mock("./fairnessWorkbookContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fairnessWorkbookContext")>();
  return { ...actual, loadFairnessWorkbookContext };
});
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));
vi.mock("@/lib/emergencyMode/state", () => ({ getEmergencyDateSet, resolveOperationalMode }));

const { loadDutyFairnessReadModel } = await import("./dutyFairness");

const FAIRNESS_HEADER = ["שם", "הקצאה", "ניקוד הפוטנציאל הקודם", "ניקוד לפוטנציאל הנוכחי", 'סופ"שים', "פטורים"];

function fairnessSheet(name: string, rows: string[][]): RawSheet {
  return { name, values: [FAIRNESS_HEADER, ...rows] };
}

function person(overrides: Partial<Person> = {}): Person {
  return { id: "p_tech", name: "טל טכנאי", email: null, isManager: false, isTechnician: true, isSupervisor: false, personnelType: null, dischargeDate: null, enlistmentDate: null, ...overrides };
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
  getEmergencyDateSet.mockReset();
  getEmergencyDateSet.mockResolvedValue(new Set());
  resolveOperationalMode.mockReset();
  resolveOperationalMode.mockResolvedValue({ kind: "regular" });
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

describe("loadDutyFairnessReadModel — completedAllocationTotal: derived from the real schedule sheet, end-to-end", () => {
  it("weighs confirmed guard-duty ('שומר 1') schedule entries for the row's own person, within the selected H1 period -- each isolated day is its own single-day 0.25 allocation, never a raw count", async () => {
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
    // Two isolated (non-consecutive) single-day guard blocks -> 0.25 + 0.25.
    expect(technicianRow?.completedAllocationTotal).toBeCloseTo(0.5);
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
    expect(technicianRow?.completedAllocationTotal).toBeCloseTo(0.25);
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
    expect(technicianRow?.completedAllocationTotal).toBeCloseTo(0.25);
  });

  it('a non-comparable person (\'ר"צ\', null target/status) still shows a real completed-allocation total', async () => {
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
    expect(row.completedAllocationTotal).toBeCloseTo(0.25);
  });

  it("no schedule data at all -> a real 0, never null, for a resolved person", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext({ h2Rows: [["טל טכנאי", "טכנאי", "5", "6", "1", "-"]] }));
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianRow = result.model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(technicianRow?.completedAllocationTotal).toBe(0);
  });
});

describe("loadDutyFairnessReadModel — historical duty personnel (former employee, no longer in current כ\"א)", () => {
  // Synthetic scenario for a technician who performed real duties, then left
  // the current roster mid-period (e.g. transferred departments). "עומר
  // עזוב" is corroborated by BOTH a real schedule column AND a real
  // unresolved Fairness-table row -- current roster is only "טל טכנאי".
  function contextWithFormerEmployee() {
    const currentPerson = person();
    return {
      status: "ok" as const,
      context: {
        person: currentPerson,
        people: [currentPerson],
        avatarByPersonId: new Map<string, string | null>(),
        snapshot: {
          fetchedAt: "2026-08-15T10:00:00.000Z",
          sheets: [
            { name: 'כ"א', values: [] },
            {
              name: "משמרות + תורנויות",
              values: [
                ["תאריך", "יום", "טל טכנאי", "עומר עזוב"],
                ["10/03/2026", "ג", "", "שומר 1"],
              ],
            },
            fairnessSheet('פוטנציאל תקש"אס 1-6/2026', [
              ["טל טכנאי", "טכנאי", "5", "6", "1", "-"],
              ["עומר עזוב", "טכנאי", "4", "5", "0", "-"],
            ]),
            fairnessSheet('פוטנציאל תקש"אס 7-12/2026', []),
          ],
        },
      },
    };
  }

  it("attributes the former employee's real completed duty to their own historical row, keeping the workbook's own score untouched", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(contextWithFormerEmployee());
    const result = await loadDutyFairnessReadModel("h1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const technicianGroup = result.model.groups.find((g) => g.key === "technician");
    const formerRow = technicianGroup?.rows.find((row) => row.sourceName === "עומר עזוב");
    expect(formerRow).toBeDefined();
    expect(formerRow?.personId).not.toBeNull();
    expect(formerRow?.currentScore).toBe(5);
    expect(formerRow?.completedAllocationTotal).toBeCloseTo(0.25);

    // The current-roster person's own row is untouched by the historical stand-in.
    const currentRow = technicianGroup?.rows.find((row) => row.sourceName === "טל טכנאי");
    expect(currentRow?.completedAllocationTotal).toBe(0);
  });

  it("does not mint a historical stand-in without BOTH corroborating signals (no schedule column here)", async () => {
    const ctx = contextWithFormerEmployee();
    // Drop the extra schedule column -- only the Fairness-table row remains.
    ctx.context.snapshot.sheets[1] = {
      name: "משמרות + תורנויות",
      values: [["תאריך", "יום", "טל טכנאי"], ["10/03/2026", "ג", ""]],
    };
    loadFairnessWorkbookContext.mockResolvedValue(ctx);
    const result = await loadDutyFairnessReadModel("h1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((g) => g.key === "technician");
    const formerRow = technicianGroup?.rows.find((row) => row.sourceName === "עומר עזוב");
    expect(formerRow?.personId).toBeNull();
  });
});

describe("loadDutyFairnessReadModel — Duty-Fairness-local Potential-derived completed-duty evidence (duty-only current person, e.g. Nadav-shaped)", () => {
  // Combines the Potential sheet's real operational date/day block (row 0:
  // תאריך/יום/'רס"ר 1' -- real duty evidence) with its separate "טבלת צדק"
  // Fairness table further down the SAME sheet -- the two real, distinct
  // tables the actual workbook keeps on one tab (`lib/parsers/potential.ts`
  // / `lib/parsers/fairness.ts`).
  function potentialSheetWithOperationalDuties(
    name: string,
    operationalRows: string[][],
    fairnessRow: string[] | null,
  ): RawSheet {
    return {
      name,
      values: [
        ["תאריך", "יום", 'רס"ר 1'],
        ...operationalRows,
        [],
        FAIRNESS_HEADER,
        ...(fairnessRow ? [fairnessRow] : []),
      ],
    };
  }

  const NADAV = person({ id: "p_nadav", name: 'נדב ליאל וקנין', isTechnician: false, isSupervisor: false });

  function contextFor(
    h2OperationalRows: string[][],
    overrides: Partial<{ people: Person[]; scheduleRows: string[][] }> = {},
  ) {
    const people = overrides.people ?? [NADAV];
    return {
      status: "ok" as const,
      context: {
        person: people[0],
        people,
        avatarByPersonId: new Map<string, string | null>(),
        snapshot: {
          fetchedAt: "2026-08-15T10:00:00.000Z",
          sheets: [
            { name: 'כ"א', values: [] },
            {
              name: "משמרות + תורנויות",
              values: overrides.scheduleRows
                ? [["תאריך", "יום", ...people.map((p) => p.name)], ...overrides.scheduleRows]
                : [],
            },
            potentialSheetWithOperationalDuties('פוטנציאל תקש"אס 1-6/2026', [], null),
            potentialSheetWithOperationalDuties('פוטנציאל תקש"אס 7-12/2026', h2OperationalRows, [
              NADAV.name,
              "אחר",
              "4",
              "5",
              "0",
              "-",
            ]),
          ],
        },
      },
    };
  }

  it("a real past rasar duty recorded under the operational short name 'נדב' counts toward completedAllocationTotal, via the unique-short-name resolution already used by classifyPotentialSourceOwnership", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(contextFor([["10/07/2026", "ה", "נדב"]]));
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const otherGroup = result.model.groups.find((g) => g.key === "other");
    const row = otherGroup?.rows.find((r) => r.sourceName === NADAV.name);
    expect(row?.personId).toBe(NADAV.id);
    expect(row?.completedAllocationTotal).toBeCloseTo(0.2);
  });

  it("a future-dated Potential entry never counts, even though it resolves fine -- the SAME existing [periodStart, effectiveEndDate] cutoff computeCompletedDutyAllocation always applies", async () => {
    // NOW is mocked to 2026-08-15 in beforeEach -- 20/08/2026 is still inside
    // H2 but after "now", so it must not count as completed yet.
    loadFairnessWorkbookContext.mockResolvedValue(contextFor([["20/08/2026", "ה", "נדב"]]));
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const otherGroup = result.model.groups.find((g) => g.key === "other");
    const row = otherGroup?.rows.find((r) => r.sourceName === NADAV.name);
    expect(row?.completedAllocationTotal).toBe(0);
  });

  it("an ambiguous short name (two current people sharing the same leading token) never counts -- classifyPotentialSourceOwnership fails closed, no arbitrary pick", async () => {
    const secondNadav = person({ id: "p_nadav2", name: "נדב אחר לגמרי", isTechnician: false, isSupervisor: false });
    loadFairnessWorkbookContext.mockResolvedValue(
      contextFor([["10/07/2026", "ה", "נדב"]], { people: [NADAV, secondNadav] }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const otherGroup = result.model.groups.find((g) => g.key === "other");
    const row = otherGroup?.rows.find((r) => r.sourceName === NADAV.name);
    expect(row?.personId).toBe(NADAV.id); // his own Fairness-table row still resolves by exact full name
    expect(row?.completedAllocationTotal).toBe(0); // but the ambiguous short-name operational entry never attributes to him
  });

  it("a real internal schedule Event for the same date/family/slot prevents double-counting the Potential-derived duplicate", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      contextFor([["10/07/2026", "ה", "נדב"]], { scheduleRows: [["10/07/2026", "ה", 'רס"ר']] }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const otherGroup = result.model.groups.find((g) => g.key === "other");
    const row = otherGroup?.rows.find((r) => r.sourceName === NADAV.name);
    // Exactly one 0.2 rasar-day contribution -- never 0.4 from both the real
    // Event and a redundant Potential-derived duplicate.
    expect(row?.completedAllocationTotal).toBeCloseTo(0.2);
  });

  it("stays isTechnician/isSupervisor false and lands in the 'other' group, never 'technician'/'supervisor', purely from real duty participation", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(contextFor([["10/07/2026", "ה", "נדב"]]));
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.model.groups.map((g) => g.key)).toEqual(["other"]);
    expect(NADAV.isTechnician).toBe(false);
    expect(NADAV.isSupervisor).toBe(false);
  });
});

describe("loadDutyFairnessReadModel — Potential source-precedence swap regression (production-shaped, guard/reserve): a stale same-week Potential entry never adds a phantom extra completed-duty contribution", () => {
  const ITAY = person({ id: "p_itay", name: "איתן בדיקה", isTechnician: false, isSupervisor: false });

  function potentialSheetWithGuard4(name: string, operationalRows: string[][]): RawSheet {
    return {
      name,
      values: [
        ["תאריך", "יום", "שומר 4"],
        ...operationalRows,
        [],
        FAIRNESS_HEADER,
        [ITAY.name, "אחר", "4", "5", "0", "-"],
      ],
    };
  }

  function contextForSwap(overrides: Partial<{ scheduleRows: string[][] }> = {}) {
    return {
      status: "ok" as const,
      context: {
        person: ITAY,
        people: [ITAY],
        avatarByPersonId: new Map<string, string | null>(),
        snapshot: {
          fetchedAt: "2026-08-15T10:00:00.000Z",
          sheets: [
            { name: 'כ"א', values: [] },
            {
              name: "משמרות + תורנויות",
              values: overrides.scheduleRows ? [["תאריך", "יום", ITAY.name], ...overrides.scheduleRows] : [],
            },
            potentialSheetWithGuard4('פוטנציאל תקש"אס 1-6/2026', []),
            potentialSheetWithGuard4('פוטנציאל תקש"אס 7-12/2026', [["12/07/2026", "א", ITAY.name]]),
          ],
        },
      },
    };
  }

  it("a stale 12/07 Potential guard-4 entry never adds a phantom extra contribution once the real internal duty moved to 14-16/07 within the SAME week (a swap) -- total is just the real block's own half_week weight (0.5), never real+phantom (0.75)", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      contextForSwap({
        scheduleRows: [
          ["14/07/2026", "ג", "שומר 4"],
          ["15/07/2026", "ד", "שומר 4"],
          ["16/07/2026", "ה", "שומר 4"],
        ],
      }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const otherGroup = result.model.groups.find((g) => g.key === "other");
    const row = otherGroup?.rows.find((r) => r.sourceName === ITAY.name);
    expect(row?.completedAllocationTotal).toBeCloseTo(0.5);
  });

  it("anti-regression: the SAME Potential guard-4 entry still counts as completed-duty evidence on its own when there is NO real internal duty for that slot anywhere in that week", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(contextForSwap());
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const otherGroup = result.model.groups.find((g) => g.key === "other");
    const row = otherGroup?.rows.find((r) => r.sourceName === ITAY.name);
    expect(row?.completedAllocationTotal).toBeCloseTo(0.25);
  });

  it("anti-regression: a real duty for the same slot in a DIFFERENT week never suppresses the Potential entry's own contribution", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      contextForSwap({
        // A guard-4 block the week before 12/07 -- a different, already-
        // completed requirement, never evidence that 12/07 is stale.
        scheduleRows: [["05/07/2026", "א", "שומר 4"]],
      }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const otherGroup = result.model.groups.find((g) => g.key === "other");
    const row = otherGroup?.rows.find((r) => r.sourceName === ITAY.name);
    // 0.25 (05/07 real single-day) + 0.25 (12/07 Potential-derived single-day) = 0.5
    expect(row?.completedAllocationTotal).toBeCloseTo(0.5);
  });
});

describe("loadDutyFairnessReadModel — Justice Table redesign, corrected: personalTargetTotal is the workbook's own currentScore column (\"ניקוד לפוטנציאל הנוכחי\"), never reconstructed from Potential events and never a role-based constant", () => {
  const DANI = person({ id: "p_dani", name: "דני טכנאי", isTechnician: true });
  const NOA = person({ id: "p_noa", name: "נועה טכנאית", isTechnician: true });

  function contextWithTwoTechnicians(fairnessRows: string[][], scheduleRows: string[][] = []) {
    return {
      status: "ok" as const,
      context: {
        person: DANI,
        people: [DANI, NOA],
        avatarByPersonId: new Map<string, string | null>(),
        snapshot: {
          fetchedAt: "2026-08-15T10:00:00.000Z",
          sheets: [
            { name: 'כ"א', values: [] },
            {
              name: "משמרות + תורנויות",
              values: [["תאריך", "יום", DANI.name, NOA.name], ...scheduleRows],
            },
            { name: 'פוטנציאל תקש"אס 1-6/2026', values: [FAIRNESS_HEADER] },
            {
              name: 'פוטנציאל תקש"אס 7-12/2026',
              values: [FAIRNESS_HEADER, ...fairnessRows],
            },
          ],
        },
      },
    };
  }

  it("two technicians with the SAME allocationLabel get DIFFERENT personalTargetTotal, straight from the workbook's own currentScore column -- never reconstructed from Potential operational rows", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      contextWithTwoTechnicians([
        [DANI.name, "טכנאי", "5", "6", "0", "-"],
        [NOA.name, "טכנאי", "5", "2", "0", "-"],
      ]),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const technicianGroup = result.model.groups.find((g) => g.key === "technician");
    const daniRow = technicianGroup?.rows.find((r) => r.personId === DANI.id);
    const noaRow = technicianGroup?.rows.find((r) => r.personId === NOA.id);

    expect(daniRow?.personalTargetTotal).toBe(6);
    expect(noaRow?.personalTargetTotal).toBe(2);
    // Same role, same workbook comparisonTarget -- but a genuinely different personal target.
    expect(daniRow?.comparisonTarget).toBe(noaRow?.comparisonTarget);
    expect(daniRow?.personalTargetTotal).not.toBe(noaRow?.personalTargetTotal);
  });

  it("progress is computed against each person's OWN personalTargetTotal (their own workbook currentScore), so identical completed work yields different progress percentages", async () => {
    // Both technicians actually COMPLETE exactly one real רס"ר day each, from
    // the real schedule sheet -- completedAllocationTotal stays entirely
    // schedule-derived and unaffected by this correction.
    loadFairnessWorkbookContext.mockResolvedValue(
      contextWithTwoTechnicians(
        [
          [DANI.name, "טכנאי", "5", "6", "0", "-"],
          [NOA.name, "טכנאי", "5", "2", "0", "-"],
        ],
        [
          ["01/07/2026", "ד", 'רס"ר', ""],
          ["10/07/2026", "", "", 'רס"ר'],
        ],
      ),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const technicianGroup = result.model.groups.find((g) => g.key === "technician");
    const daniRow = technicianGroup?.rows.find((r) => r.personId === DANI.id);
    const noaRow = technicianGroup?.rows.find((r) => r.personId === NOA.id);

    expect(daniRow?.completedAllocationTotal).toBeCloseTo(0.2);
    expect(noaRow?.completedAllocationTotal).toBeCloseTo(0.2);
    expect(daniRow?.personalTargetTotal).toBe(6);
    expect(noaRow?.personalTargetTotal).toBe(2);
    // Same completed work, but Dani's own target (6) is 3x Noa's (2) -> very different progress.
    expect(daniRow?.targetProgressRatio).toBeCloseTo(0.2 / 6);
    expect(noaRow?.targetProgressRatio).toBeCloseTo(0.2 / 2);
    expect(daniRow?.targetProgressRatio).not.toBeCloseTo(noaRow?.targetProgressRatio ?? -1);
  });

  it("a person with a real zero personalTargetTotal (the workbook's own currentScore is exactly 0) gets a real personalTargetTotal of 0, never an invented role-based fallback", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      contextWithTwoTechnicians([
        [DANI.name, "טכנאי", "5", "6", "0", "-"],
        [NOA.name, "טכנאי", "5", "0", "0", "-"],
      ]),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((g) => g.key === "technician");
    const noaRow = technicianGroup?.rows.find((r) => r.personId === NOA.id);
    expect(noaRow?.personalTargetTotal).toBe(0);
    expect(noaRow?.targetProgressRatio).toBeNull();
  });

  it("real-workbook regression, end-to-end: Steven (6.3), Lior (6.2), and Gidon (6) share the technician role but the loader carries each of their own real currentScore straight through to personalTargetTotal", async () => {
    const STEVEN = person({ id: "p_steven", name: "סטיבן פופנרוב", isTechnician: true });
    const LIOR = person({ id: "p_lior", name: "ליאור בגון", isTechnician: true });
    const GIDON = person({ id: "p_gidon", name: "גדעון פולין", isTechnician: true });
    loadFairnessWorkbookContext.mockResolvedValue({
      status: "ok" as const,
      context: {
        person: STEVEN,
        people: [STEVEN, LIOR, GIDON],
        avatarByPersonId: new Map<string, string | null>(),
        snapshot: {
          fetchedAt: "2026-08-15T10:00:00.000Z",
          sheets: [
            { name: 'כ"א', values: [] },
            { name: "משמרות + תורנויות", values: [["תאריך", "יום", STEVEN.name, LIOR.name, GIDON.name]] },
            { name: 'פוטנציאל תקש"אס 1-6/2026', values: [FAIRNESS_HEADER] },
            {
              name: 'פוטנציאל תקש"אס 7-12/2026',
              values: [
                FAIRNESS_HEADER,
                [STEVEN.name, "טכנאי", "5", "6.3", "0", "-"],
                [LIOR.name, "טכנאי", "5", "6.2", "0", "-"],
                [GIDON.name, "טכנאי", "5", "6", "0", "-"],
              ],
            },
          ],
        },
      },
    });
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((g) => g.key === "technician");
    expect(technicianGroup?.rows.find((r) => r.personId === STEVEN.id)?.personalTargetTotal).toBe(6.3);
    expect(technicianGroup?.rows.find((r) => r.personId === LIOR.id)?.personalTargetTotal).toBe(6.2);
    expect(technicianGroup?.rows.find((r) => r.personId === GIDON.id)?.personalTargetTotal).toBe(6);
  });
});

describe("loadDutyFairnessReadModel — Emergency Mode date exclusion + suspended pace (spec section 19)", () => {
  it("an emergency date touching a completed duty excludes it from completedAllocationTotal", async () => {
    getEmergencyDateSet.mockResolvedValue(new Set(["2026-08-10"]));
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        h2Rows: [["טל טכנאי", "טכנאי", "5", "6", "0", "-"]],
        scheduleRows: [["10/08/2026", "ב", "שומר 1"]],
      }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianRow = result.model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(technicianRow?.completedAllocationTotal).toBe(0);
  });

  it("resolves getEmergencyDateSet against the loader's own resolved 'today' date", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext({ h2Rows: [["טל טכנאי", "טכנאי", "5", "6", "0", "-"]] }));
    await loadDutyFairnessReadModel("h2");
    expect(getEmergencyDateSet).toHaveBeenCalledWith("2026-08-15");
  });

  it("a deployment that has never activated Emergency Mode (empty excluded set, regular mode) behaves byte-for-byte as before", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        h2Rows: [["טל טכנאי", "טכנאי", "5", "6", "0", "-"]],
        scheduleRows: [["10/08/2026", "ב", "שומר 1"]],
      }),
    );
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianRow = result.model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(technicianRow?.completedAllocationTotal).toBeCloseTo(0.25);
    expect(technicianRow?.paceStatus).not.toBe("suspended");
  });

  it("while Emergency Mode is CURRENTLY active, every row's paceStatus is forced to 'suspended' regardless of elapsed time/progress", async () => {
    resolveOperationalMode.mockResolvedValue({
      kind: "emergency",
      period: {
        id: "p1",
        startDate: "2026-08-01",
        endDate: null,
        activatedAt: "2026-08-01T00:00:00.000Z",
        activatedByUserId: "u1",
        activatedByPersonId: "p_manager",
        activatedByPersonName: "מנהל בדיקה",
        deactivatedAt: null,
        deactivatedByUserId: null,
        deactivatedByPersonId: null,
        deactivatedByPersonName: null,
      },
    });
    loadFairnessWorkbookContext.mockResolvedValue(okContext({ h2Rows: [["טל טכנאי", "טכנאי", "5", "6", "0", "-"]] }));
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianRow = result.model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(technicianRow?.paceStatus).toBe("suspended");
  });

  it("after Emergency Mode deactivation (past periods still excluded, but currently regular), paceStatus resumes normal below/on/ahead judgment", async () => {
    resolveOperationalMode.mockResolvedValue({ kind: "regular" });
    getEmergencyDateSet.mockResolvedValue(new Set(["2026-07-01"]));
    loadFairnessWorkbookContext.mockResolvedValue(okContext({ h2Rows: [["טל טכנאי", "טכנאי", "5", "6", "0", "-"]] }));
    const result = await loadDutyFairnessReadModel("h2");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianRow = result.model.groups.find((g) => g.key === "technician")?.rows[0];
    expect(technicianRow?.paceStatus).not.toBe("suspended");
  });
});
