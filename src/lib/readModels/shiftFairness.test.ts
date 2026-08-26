import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/lib/domain/event";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";

const loadFairnessWorkbookContext = vi.fn();
const getJerusalemLocalNow = vi.fn();
const parseScheduleSheet = vi.fn();
const parseEvent = vi.fn();
const getEmergencyDateSet = vi.fn();

vi.mock("./fairnessWorkbookContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fairnessWorkbookContext")>();
  return { ...actual, loadFairnessWorkbookContext };
});
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));
vi.mock("@/lib/parsers/schedule", () => ({ parseScheduleSheet }));
vi.mock("@/lib/parsers/event", () => ({ parseEvent }));
vi.mock("@/lib/emergencyMode/state", () => ({ getEmergencyDateSet }));

const { loadShiftFairnessReadModel } = await import("./shiftFairness");

function person(overrides: Partial<Person> = {}): Person {
  return { id: "p_tech", name: "טל טכנאי", email: null, isManager: false, isTechnician: true, isSupervisor: false, personnelType: null, ...overrides };
}

function shiftEvent(overrides: Partial<Event> & { personId: string; date: string }): Event {
  return {
    personName: "",
    title: "משמרת",
    rawValue: "משמרת",
    category: "shift",
    certainty: "confirmed",
    role: "technician",
    period: "day",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: "A1",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: null,
    absenceKind: null,
    ...overrides,
  };
}

function fairnessSheet(name: string, rows: string[][]): RawSheet {
  const header = ["שם", "הקצאה", "ניקוד הפוטנציאל הקודם", "ניקוד לפוטנציאל הנוכחי", 'סופ"שים', "פטורים"];
  return { name, values: [header, ...rows] };
}

function scheduleSheet(): RawSheet {
  return { name: "משמרות + תורנויות", values: [] };
}

function okContext(
  overrides: Partial<{
    people: Person[];
    events: Event[];
    potentialH1: RawSheet;
    potentialH2: RawSheet;
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
          scheduleSheet(),
          overrides.potentialH1 ?? fairnessSheet('פוטנציאל תקש"אס 1-6/2026', []),
          overrides.potentialH2 ?? fairnessSheet('פוטנציאל תקש"אס 7-12/2026', []),
        ],
      },
    },
  };
}

beforeEach(() => {
  loadFairnessWorkbookContext.mockReset();
  getJerusalemLocalNow.mockReset();
  parseScheduleSheet.mockReset();
  parseEvent.mockReset();
  getEmergencyDateSet.mockReset();
  getEmergencyDateSet.mockResolvedValue(new Set());
  getJerusalemLocalNow.mockReturnValue({ date: "2026-08-15", minuteOfDay: 600 });
  // `parseScheduleSheet` returns already-Event-shaped objects, `parseEvent` is the identity --
  // this loader calls `parseScheduleSheet(...).map(parseEvent)`, so together they let a test
  // control exactly which real Events flow into the (real, unmocked) shift engine.
  parseScheduleSheet.mockReturnValue([]);
  parseEvent.mockImplementation((raw: unknown) => raw as Event);
});

describe("loadShiftFairnessReadModel — auth pass-through", () => {
  it.each(["unauthenticated", "missing_email", "unmapped", "ambiguous_identity"])("%s: passes through untouched", async (status) => {
    loadFairnessWorkbookContext.mockResolvedValue({ status });
    const result = await loadShiftFairnessReadModel(null);
    expect(result).toEqual({ status });
  });

});

describe("loadShiftFairnessReadModel — D. month resolution", () => {
  it("null month -> current Jerusalem-local month", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    const result = await loadShiftFairnessReadModel(null);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.model.month).toBe("2026-08");
  });

  it("a valid month param is honored", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    const result = await loadShiftFairnessReadModel("2026-06");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.model.month).toBe("2026-06");
  });

  it("an invalid month param falls back to the current month, never a crash", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    const result = await loadShiftFairnessReadModel("not-a-month");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.model.month).toBe("2026-08");
  });

  it("a closed past month resolves periodStatus: closed via the real (unmocked) engine", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    const result = await loadShiftFairnessReadModel("2026-06");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.model.periodStatus).toBe("closed");
  });
});

describe("loadShiftFairnessReadModel — real confirmed shifts flow through to the real engine", () => {
  it("a confirmed technician shift within the requested month is counted as actual work", async () => {
    parseScheduleSheet.mockReturnValue([shiftEvent({ personId: "p_tech", date: "2026-08-05", role: "technician" })]);
    loadFairnessWorkbookContext.mockResolvedValue(okContext());

    const result = await loadShiftFairnessReadModel("2026-08");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((group) => group.role === "technician");
    expect(technicianGroup?.rows[0]?.actualShifts).toBe(1);
  });
});

describe("loadShiftFairnessReadModel — reserveParticipation wiring for closed periods", () => {
  it("genuinely period-dated Fairness-table evidence makes a closed period modelable", async () => {
    parseScheduleSheet.mockReturnValue([shiftEvent({ personId: "p_tech", date: "2026-06-05", role: "technician" })]);
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        potentialH1: fairnessSheet('פוטנציאל תקש"אס 1-6/2026', [["טל טכנאי", "טכנאי", "-", "-", "-", "-"]]),
      }),
    );

    const result = await loadShiftFairnessReadModel("2026-06");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((group) => group.role === "technician");
    // Dated evidence for THIS specific h1/2026 period makes the closed period modelable -- target is a real number, not null.
    expect(technicianGroup?.rows[0]?.target).not.toBeNull();
  });

  it("no dated evidence for a closed period -> target stays null, actual work stays visible", async () => {
    parseScheduleSheet.mockReturnValue([shiftEvent({ personId: "p_tech", date: "2026-06-05", role: "technician" })]);
    loadFairnessWorkbookContext.mockResolvedValue(okContext());

    const result = await loadShiftFairnessReadModel("2026-06");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((group) => group.role === "technician");
    expect(technicianGroup?.rows[0]?.actualShifts).toBe(1);
    expect(technicianGroup?.rows[0]?.target).toBeNull();
  });
});

describe("loadShiftFairnessReadModel — avatar enrichment (never touches calculations)", () => {
  it("stamps each row's avatarUrl from the context's avatarByPersonId map, keyed by personId", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({ avatarByPersonId: new Map([["p_tech", "https://lh3.googleusercontent.com/a/tal.jpg"]]) }),
    );
    const result = await loadShiftFairnessReadModel(null);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((group) => group.role === "technician");
    expect(technicianGroup?.rows[0]?.avatarUrl).toBe("https://lh3.googleusercontent.com/a/tal.jpg");
  });

  it("falls back to null (never undefined, never a crash) when the person has no entry in the map", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext({ avatarByPersonId: new Map() }));
    const result = await loadShiftFairnessReadModel(null);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const technicianGroup = result.model.groups.find((group) => group.role === "technician");
    expect(technicianGroup?.rows[0]?.avatarUrl).toBeNull();
  });

  it("never leaks one person's photo onto a different person's row", async () => {
    parseScheduleSheet.mockReturnValue([
      shiftEvent({ personId: "p_tech", date: "2026-08-05", role: "technician" }),
      shiftEvent({ personId: "p_sup", date: "2026-08-05", role: "supervisor" }),
    ]);
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        people: [person(), person({ id: "p_sup", name: "שרה אחמ״שית", isTechnician: false, isSupervisor: true })],
        avatarByPersonId: new Map([
          ["p_tech", "https://lh3.googleusercontent.com/a/tal.jpg"],
          ["p_sup", "https://lh3.googleusercontent.com/a/sara.jpg"],
        ]),
      }),
    );

    const result = await loadShiftFairnessReadModel("2026-08");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const technicianRow = result.model.groups.find((g) => g.role === "technician")?.rows[0];
    const supervisorRow = result.model.groups.find((g) => g.role === "supervisor")?.rows[0];
    expect(technicianRow?.avatarUrl).toBe("https://lh3.googleusercontent.com/a/tal.jpg");
    expect(supervisorRow?.avatarUrl).toBe("https://lh3.googleusercontent.com/a/sara.jpg");
  });

  it("changes nothing else about the model -- same actualShifts/target/status as without avatar data", async () => {
    parseScheduleSheet.mockReturnValue([shiftEvent({ personId: "p_tech", date: "2026-08-05", role: "technician" })]);
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    const withoutAvatars = await loadShiftFairnessReadModel("2026-08");

    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({ avatarByPersonId: new Map([["p_tech", "https://lh3.googleusercontent.com/a/tal.jpg"]]) }),
    );
    const withAvatars = await loadShiftFairnessReadModel("2026-08");

    expect(withoutAvatars.status).toBe("ok");
    expect(withAvatars.status).toBe("ok");
    if (withoutAvatars.status !== "ok" || withAvatars.status !== "ok") return;

    const stripAvatar = (row: unknown) => {
      const clone = { ...(row as Record<string, unknown>) };
      delete clone.avatarUrl;
      return clone;
    };
    expect(withAvatars.model.groups.map((g) => g.rows.map(stripAvatar))).toEqual(
      withoutAvatars.model.groups.map((g) => g.rows.map(stripAvatar)),
    );
  });
});

describe("loadShiftFairnessReadModel — historical duty personnel never leaks in (Duty Fairness-only mechanism)", () => {
  // Same corroborating shape Duty Fairness would use to recognize a former
  // employee (real schedule-attributed event + a real unresolved
  // Fairness-table row for the same name) -- this loader never imports
  // `resolveHistoricalDutyPersonnel` at all, so it must stay fully
  // unaffected: only the current roster's own people ever appear.
  it("a former employee's schedule event and unresolved Fairness-table row never produce a row or leak into any group", async () => {
    parseScheduleSheet.mockReturnValue([
      shiftEvent({ personId: "p_former", date: "2026-08-05", role: "technician" }),
      shiftEvent({ personId: "p_tech", date: "2026-08-06", role: "technician" }),
    ]);
    loadFairnessWorkbookContext.mockResolvedValue(
      okContext({
        potentialH1: fairnessSheet('פוטנציאל תקש"אס 1-6/2026', [["עומר עזוב", "טכנאי", "4", "5", "0", "-"]]),
      }),
    );

    const result = await loadShiftFairnessReadModel("2026-08");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const allRows = result.model.groups.flatMap((group) => group.rows);
    expect(allRows).toHaveLength(1);
    expect(allRows.every((row) => row.personId === "p_tech")).toBe(true);
    expect(allRows.some((row) => row.personId === "p_former")).toBe(false);
  });
});

describe("loadShiftFairnessReadModel — Emergency Mode date exclusion (spec section 18)", () => {
  it("an emergency date is excluded from completed shifts -- a confirmed shift ON that date never counts", async () => {
    getEmergencyDateSet.mockResolvedValue(new Set(["2026-08-06"]));
    parseScheduleSheet.mockReturnValue([shiftEvent({ personId: "p_tech", date: "2026-08-06", role: "technician" })]);
    loadFairnessWorkbookContext.mockResolvedValue(okContext());

    const result = await loadShiftFairnessReadModel("2026-08");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const row = result.model.groups.flatMap((g) => g.rows).find((r) => r.personId === "p_tech");
    expect(row?.actualShifts).toBe(0);
  });

  it("passes the same excluded-date set to the tooltip explanation so it never disagrees with the headline number", async () => {
    getEmergencyDateSet.mockResolvedValue(new Set(["2026-08-06"]));
    // A leave (blocking absence) event on the SAME emergency date -- if the
    // tooltip didn't honor the same exclusion, it would still count this
    // as a "leaveDays" factor even though that date no longer contributes
    // to the headline number at all.
    parseScheduleSheet.mockReturnValue([
      shiftEvent({ personId: "p_tech", date: "2026-08-05", role: "technician" }),
      {
        personName: "",
        title: "חופש",
        rawValue: "חופש",
        category: "absence" as const,
        certainty: "confirmed" as const,
        role: null,
        period: "unspecified" as const,
        sourceSheet: "משמרות + תורנויות",
        sourceCell: "A2",
        slot: null,
        shadow: false,
        startTimeOverride: null,
        endTimeOverride: null,
        changeNote: null,
        dutyFamily: null,
        absenceKind: "vacation" as const,
        personId: "p_tech",
        date: "2026-08-06",
      },
    ]);
    loadFairnessWorkbookContext.mockResolvedValue(okContext());

    const result = await loadShiftFairnessReadModel("2026-08");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const row = result.model.groups.flatMap((g) => g.rows).find((r) => r.personId === "p_tech");
    expect(row?.expectationFactors?.leaveDays).toBe(0);
  });

  it("resolves getEmergencyDateSet against the loader's own resolved 'today' date", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());

    await loadShiftFairnessReadModel("2026-08");

    expect(getEmergencyDateSet).toHaveBeenCalledWith("2026-08-15");
  });

  it("an empty excluded-date set (no Emergency Mode ever activated) changes nothing", async () => {
    getEmergencyDateSet.mockResolvedValue(new Set());
    parseScheduleSheet.mockReturnValue([shiftEvent({ personId: "p_tech", date: "2026-08-06", role: "technician" })]);
    loadFairnessWorkbookContext.mockResolvedValue(okContext());

    const result = await loadShiftFairnessReadModel("2026-08");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const row = result.model.groups.flatMap((g) => g.rows).find((r) => r.personId === "p_tech");
    expect(row?.actualShifts).toBe(1);
  });
});

describe("loadShiftFairnessReadModel — emergency date at the period boundary shrinks periodEndDate", () => {
  it("excluding 'today' (the month's last evaluable date) shifts periodEndDate to the prior date", async () => {
    getEmergencyDateSet.mockResolvedValue(new Set(["2026-08-15"]));
    loadFairnessWorkbookContext.mockResolvedValue(okContext());

    const result = await loadShiftFairnessReadModel("2026-08");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.model.periodEndDate).toBe("2026-08-14");
  });
});
