import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/lib/domain/event";
import type { Person } from "@/lib/domain/types";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import { getOperationalWeek } from "@/lib/domain/operationalWeek";
import type { LocalNow } from "@/lib/domain/localNow";
import type { RecipientResolution } from "./recipients";

function person(overrides: Partial<Person> & Pick<Person, "id" | "name">): Person {
  return { email: null, isManager: false, isTechnician: false, isSupervisor: false, personnelType: null, ...overrides };
}

function event(overrides: Partial<Event> & Pick<Event, "personId" | "date" | "category">): Event {
  return {
    personName: overrides.personId,
    title: "",
    rawValue: "",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "sheet",
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

const schedule = buildShiftSchedule("07:00");
const now: LocalNow = { date: "2026-08-19", minuteOfDay: 600 };
const week = getOperationalWeek(now);

function emptyResolution(): RecipientResolution {
  return { resolved: new Map(), unmappedCount: 0, ambiguousEmailCount: 0, noEmailCount: 0 };
}

const store = {
  advanceNotificationBaseline: vi.fn(),
  applyPendingChanges: vi.fn(async () => {}),
  claimDuePendingChanges: vi.fn<() => Promise<import("./store").ClaimedPendingChange[]>>(async () => []),
  clearWeekState: vi.fn(async () => {}),
  countOpenPendingChanges: vi.fn(async () => 0),
  deletePendingChange: vi.fn(async () => {}),
  getObservedFacts: vi.fn(async () => new Map()),
  insertNotificationJobIfAbsent: vi.fn(async () => true),
  peekBaselineState: vi.fn(),
  peekDuePendingChangesCount: vi.fn(async () => 0),
  seedObservedFacts: vi.fn(async () => {}),
  setObservedFact: vi.fn(async () => {}),
};

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadModule() {
  vi.doMock("./store", () => store);
  return import("./changeDetection");
}

describe("runChangeDetection -- baseline transitions", () => {
  it("first-ever run silently seeds the baseline and sends nothing", async () => {
    store.advanceNotificationBaseline.mockResolvedValue({ action: "initialized", previousWeekStart: null });
    const { runChangeDetection } = await loadModule();

    const summary = await runChangeDetection({
      events: [event({ personId: "p1", date: week.weekStart, category: "shift", period: "day" })],
      people: [],
      shiftSchedule: schedule,
      week,
      persist: true,
      recipientResolution: emptyResolution(),
      personNameById: new Map(),
    });

    expect(summary.baselineAction).toBe("initialized");
    expect(summary.semanticChangesDetected).toBe(0);
    expect(summary.jobsCreated).toBe(0);
    expect(store.seedObservedFacts).toHaveBeenCalledTimes(1);
    expect(store.getObservedFacts).not.toHaveBeenCalled();
    expect(store.insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("week rollover clears the PREVIOUS week's state, silently re-seeds the new week, and sends nothing", async () => {
    store.advanceNotificationBaseline.mockResolvedValue({ action: "rolled_over", previousWeekStart: "2026-08-09" });
    const { runChangeDetection } = await loadModule();

    const summary = await runChangeDetection({
      events: [],
      people: [],
      shiftSchedule: schedule,
      week,
      persist: true,
      recipientResolution: emptyResolution(),
      personNameById: new Map(),
    });

    expect(summary.baselineAction).toBe("rolled_over");
    expect(summary.jobsCreated).toBe(0);
    expect(store.clearWeekState).toHaveBeenCalledWith("2026-08-09");
    expect(store.seedObservedFacts).toHaveBeenCalledTimes(1);
    expect(store.insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("dry-run mode never calls a single mutating store function", async () => {
    store.peekBaselineState.mockResolvedValue({ initialized: true, currentWeekStart: week.weekStart });
    const { runChangeDetection } = await loadModule();

    await runChangeDetection({
      events: [event({ personId: "p1", date: week.weekStart, category: "shift", period: "day" })],
      people: [],
      shiftSchedule: schedule,
      week,
      persist: false,
      recipientResolution: emptyResolution(),
      personNameById: new Map(),
    });

    expect(store.advanceNotificationBaseline).not.toHaveBeenCalled();
    expect(store.applyPendingChanges).not.toHaveBeenCalled();
    expect(store.claimDuePendingChanges).not.toHaveBeenCalled();
    expect(store.seedObservedFacts).not.toHaveBeenCalled();
    expect(store.setObservedFact).not.toHaveBeenCalled();
    expect(store.insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });
});

describe("runChangeDetection -- settled shift change", () => {
  it("a settled shift-period change creates exactly one job for the resolved recipient", async () => {
    store.advanceNotificationBaseline.mockResolvedValue({ action: "unchanged", previousWeekStart: week.weekStart });
    store.getObservedFacts.mockResolvedValue(
      new Map([
        [
          "shift:p1:2026-08-19",
          { factKey: "shift:p1:2026-08-19", category: "shift", value: { entries: [{ period: "day", role: "technician", shadow: false }] } },
        ],
      ]),
    );
    store.claimDuePendingChanges.mockResolvedValue([
      {
        id: "pending-1",
        weekStartDate: week.weekStart,
        factKey: "shift:p1:2026-08-19",
        category: "shift",
        originalValue: { entries: [{ period: "day", role: "technician", shadow: false }] },
        latestValue: { entries: [{ period: "night", role: "technician", shadow: false }] },
      },
    ]);

    const { runChangeDetection } = await loadModule();
    const resolution: RecipientResolution = {
      resolved: new Map([["p1", { personId: "p1", email: "p1@example.com", userId: "user-p1" }]]),
      unmappedCount: 0,
      ambiguousEmailCount: 0,
      noEmailCount: 0,
    };

    const summary = await runChangeDetection({
      events: [event({ personId: "p1", date: "2026-08-19", category: "shift", period: "night" })],
      people: [person({ id: "p1", name: "P1" })],
      shiftSchedule: schedule,
      week,
      persist: true,
      recipientResolution: resolution,
      personNameById: new Map([["p1", "P1"]]),
    });

    expect(summary.settledChanges).toBe(1);
    expect(summary.jobsCreated).toBe(1);
    expect(store.insertNotificationJobIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "shift_change",
        recipientUserId: "user-p1",
        dedupeKey: "settle:pending-1:user-p1",
      }),
    );
    expect(store.setObservedFact).toHaveBeenCalledWith(
      week.weekStart,
      "shift:p1:2026-08-19",
      "shift",
      { entries: [{ period: "night", role: "technician", shadow: false }] },
    );
    expect(store.deletePendingChange).toHaveBeenCalledWith("pending-1");
  });

  it("an unresolvable recipient (no matching Supabase user) never creates a job -- fails closed, not a guess", async () => {
    store.advanceNotificationBaseline.mockResolvedValue({ action: "unchanged", previousWeekStart: week.weekStart });
    store.getObservedFacts.mockResolvedValue(new Map());
    store.claimDuePendingChanges.mockResolvedValue([
      {
        id: "pending-2",
        weekStartDate: week.weekStart,
        factKey: "shift:p1:2026-08-19",
        category: "shift",
        originalValue: null,
        latestValue: { entries: [{ period: "day", role: "technician", shadow: false }] },
      },
    ]);

    const { runChangeDetection } = await loadModule();
    const summary = await runChangeDetection({
      events: [],
      people: [],
      shiftSchedule: schedule,
      week,
      persist: true,
      recipientResolution: emptyResolution(),
      personNameById: new Map(),
    });

    expect(summary.jobsCreated).toBe(0);
    expect(store.insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });
});

describe("runChangeDetection -- coverage gap gating", () => {
  it("only a valid -> missing transition creates a manager job", async () => {
    store.advanceNotificationBaseline.mockResolvedValue({ action: "unchanged", previousWeekStart: week.weekStart });
    store.getObservedFacts.mockResolvedValue(new Map());
    store.claimDuePendingChanges.mockResolvedValue([
      {
        id: "pending-3",
        weekStartDate: week.weekStart,
        factKey: "coverage:2026-08-19:night",
        category: "coverage",
        originalValue: { status: "full", missingTechnician: false, missingSupervisor: false },
        latestValue: { status: "missing", missingTechnician: false, missingSupervisor: true },
      },
    ]);

    const { runChangeDetection } = await loadModule();
    const manager = person({ id: "m1", name: "Manager", isManager: true });
    const resolution: RecipientResolution = {
      resolved: new Map([["m1", { personId: "m1", email: "m1@example.com", userId: "user-m1" }]]),
      unmappedCount: 0,
      ambiguousEmailCount: 0,
      noEmailCount: 0,
    };

    const summary = await runChangeDetection({
      events: [],
      people: [manager],
      shiftSchedule: schedule,
      week,
      persist: true,
      recipientResolution: resolution,
      personNameById: new Map(),
    });

    expect(summary.jobsCreated).toBe(1);
    expect(store.insertNotificationJobIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ category: "coverage_gap", recipientUserId: "user-m1" }),
    );
  });

  it("an already-missing -> still-missing transition never re-notifies", async () => {
    store.advanceNotificationBaseline.mockResolvedValue({ action: "unchanged", previousWeekStart: week.weekStart });
    store.getObservedFacts.mockResolvedValue(new Map());
    store.claimDuePendingChanges.mockResolvedValue([
      {
        id: "pending-4",
        weekStartDate: week.weekStart,
        factKey: "coverage:2026-08-19:night",
        category: "coverage",
        originalValue: { status: "missing", missingTechnician: false, missingSupervisor: true },
        latestValue: { status: "missing", missingTechnician: false, missingSupervisor: true },
      },
    ]);

    const { runChangeDetection } = await loadModule();
    const manager = person({ id: "m1", name: "Manager", isManager: true });
    const resolution: RecipientResolution = {
      resolved: new Map([["m1", { personId: "m1", email: "m1@example.com", userId: "user-m1" }]]),
      unmappedCount: 0,
      ambiguousEmailCount: 0,
      noEmailCount: 0,
    };

    const summary = await runChangeDetection({
      events: [],
      people: [manager],
      shiftSchedule: schedule,
      week,
      persist: true,
      recipientResolution: resolution,
      personNameById: new Map(),
    });

    expect(summary.jobsCreated).toBe(0);
    expect(store.insertNotificationJobIfAbsent).not.toHaveBeenCalled();
    // The observed fact is still updated -- the current truth is tracked
    // even when no notification fires.
    expect(store.setObservedFact).toHaveBeenCalled();
  });

  it("a resolved gap -> full transition never notifies", async () => {
    store.advanceNotificationBaseline.mockResolvedValue({ action: "unchanged", previousWeekStart: week.weekStart });
    store.getObservedFacts.mockResolvedValue(new Map());
    store.claimDuePendingChanges.mockResolvedValue([
      {
        id: "pending-5",
        weekStartDate: week.weekStart,
        factKey: "coverage:2026-08-19:night",
        category: "coverage",
        originalValue: { status: "missing", missingTechnician: false, missingSupervisor: true },
        latestValue: { status: "full", missingTechnician: false, missingSupervisor: false },
      },
    ]);

    const { runChangeDetection } = await loadModule();
    const summary = await runChangeDetection({
      events: [],
      people: [person({ id: "m1", name: "Manager", isManager: true })],
      shiftSchedule: schedule,
      week,
      persist: true,
      recipientResolution: emptyResolution(),
      personNameById: new Map(),
    });

    expect(summary.jobsCreated).toBe(0);
    expect(store.insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("ordinary (non-manager) resolved recipients never receive a coverage-gap job", async () => {
    store.advanceNotificationBaseline.mockResolvedValue({ action: "unchanged", previousWeekStart: week.weekStart });
    store.getObservedFacts.mockResolvedValue(new Map());
    store.claimDuePendingChanges.mockResolvedValue([
      {
        id: "pending-6",
        weekStartDate: week.weekStart,
        factKey: "coverage:2026-08-19:night",
        category: "coverage",
        originalValue: { status: "full", missingTechnician: false, missingSupervisor: false },
        latestValue: { status: "missing", missingTechnician: false, missingSupervisor: true },
      },
    ]);

    const { runChangeDetection } = await loadModule();
    const nonManager = person({ id: "u1", name: "Regular", isManager: false });
    const resolution: RecipientResolution = {
      resolved: new Map([["u1", { personId: "u1", email: "u1@example.com", userId: "user-u1" }]]),
      unmappedCount: 0,
      ambiguousEmailCount: 0,
      noEmailCount: 0,
    };

    await runChangeDetection({
      events: [],
      people: [nonManager],
      shiftSchedule: schedule,
      week,
      persist: true,
      recipientResolution: resolution,
      personNameById: new Map(),
    });

    expect(store.insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });
});
