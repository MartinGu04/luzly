import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/lib/domain/event";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";

const loadFairnessWorkbookContext = vi.fn();
const getJerusalemLocalNow = vi.fn();
const parseScheduleSheet = vi.fn();
const parseEvent = vi.fn();

vi.mock("./fairnessWorkbookContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fairnessWorkbookContext")>();
  return { ...actual, loadFairnessWorkbookContext };
});
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));
vi.mock("@/lib/parsers/schedule", () => ({ parseScheduleSheet }));
vi.mock("@/lib/parsers/event", () => ({ parseEvent }));

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
