import { describe, expect, it } from "vitest";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import type { Person } from "@/lib/domain/types";
import { buildSearchReadModel } from "./buildSearchReadModel";

// day 07:30-19:30, night 19:30-07:30(+1)
const schedule = buildShiftSchedule("07:30");

const ME_ID = "p_me";
const COLLEAGUE_ID = "p_colleague";

function me(overrides: Partial<Person> = {}): Person {
  return {
    id: ME_ID,
    name: "דני בדיקה",
    email: "dani@example.invalid",
    isManager: false,
    isTechnician: true,
    isSupervisor: false,
    personnelType: "חובה",
    ...overrides,
  };
}

function colleague(overrides: Partial<Person> = {}): Person {
  return {
    id: COLLEAGUE_ID,
    name: "עילאי כהן",
    email: "ilay@example.invalid",
    isManager: false,
    isTechnician: false,
    isSupervisor: true,
    personnelType: "קבע",
    ...overrides,
  };
}

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function shiftEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: COLLEAGUE_ID,
    personName: "עילאי כהן",
    date: "2026-08-12",
    title: "אחמ״ש יום",
    rawValue: "אחמ״ש יום",
    category: "shift",
    certainty: "confirmed",
    role: "supervisor",
    period: "day",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: nextCell(),
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

function localNow(overrides: Partial<LocalNow> = {}): LocalNow {
  return { date: "2026-08-12", minuteOfDay: 10 * 60, ...overrides }; // 10:00
}

describe("buildSearchReadModel", () => {
  it("projects the full roster, byte-for-byte the safe id/name/personnelType/role-flag shape", () => {
    const model = buildSearchReadModel({
      people: [me(), colleague()],
      events: [],
      shiftSchedule: schedule,
      meId: ME_ID,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.roster).toEqual([
      { id: ME_ID, name: "דני בדיקה", personnelType: "חובה", isSupervisor: false, isTechnician: true },
      { id: COLLEAGUE_ID, name: "עילאי כהן", personnelType: "קבע", isSupervisor: true, isTechnician: false },
    ]);
  });

  it("never includes email or sourceSheet/sourceCell anywhere in the roster or shift events", () => {
    const events = [shiftEvent({ date: "2026-08-12", period: "day" })];
    const model = buildSearchReadModel({
      people: [me(), colleague()],
      events,
      shiftSchedule: schedule,
      meId: ME_ID,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain("dani@example.invalid");
    expect(serialized).not.toContain("ilay@example.invalid");
    expect(serialized).not.toContain("sourceSheet");
    expect(serialized).not.toContain("sourceCell");
    expect(serialized).not.toContain("C1");
  });

  it("resolves each shift event's temporalState via the SAME classifyAssignmentTemporalState logic the rest of the app uses -- 'current' for an active day shift", () => {
    const events = [shiftEvent({ date: "2026-08-12", period: "day" })]; // 07:30-19:30
    const model = buildSearchReadModel({
      people: [me(), colleague()],
      events,
      shiftSchedule: schedule,
      meId: ME_ID,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow({ minuteOfDay: 10 * 60 }), // 10:00, inside the shift
    });

    expect(model.shiftEvents).toHaveLength(1);
    expect(model.shiftEvents[0]).toMatchObject({
      personId: COLLEAGUE_ID,
      date: "2026-08-12",
      period: "day",
      temporalState: "current",
    });
  });

  it("resolves an overnight shift's temporalState correctly after midnight", () => {
    const events = [shiftEvent({ date: "2026-08-11", period: "night" })];
    const model = buildSearchReadModel({
      people: [me(), colleague()],
      events,
      shiftSchedule: schedule,
      meId: ME_ID,
      fetchedAt: "2026-08-12T02:00:00.000Z",
      now: localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 }), // 02:00, still inside the overnight shift
    });

    expect(model.shiftEvents[0]).toMatchObject({ date: "2026-08-11", period: "night", temporalState: "current" });
  });

  it("excludes duties/absences and any period other than day/night -- only canonical shift events are searchable", () => {
    const events = [
      shiftEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "guard", slot: 1 }),
      shiftEvent({ category: "absence", role: null, period: "unspecified", absenceKind: "vacation" }),
      shiftEvent({ period: "morning" }),
      shiftEvent({ period: "unspecified", role: null }),
      shiftEvent({ period: "day" }),
    ];
    const model = buildSearchReadModel({
      people: [me(), colleague()],
      events,
      shiftSchedule: schedule,
      meId: ME_ID,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.shiftEvents).toHaveLength(1);
    expect(model.shiftEvents[0].period).toBe("day");
  });

  it("excludes shift events far outside the search window (bounded forward/back)", () => {
    const events = [
      shiftEvent({ date: "2025-01-01", period: "day" }), // far past
      shiftEvent({ date: "2027-01-01", period: "day" }), // far future
      shiftEvent({ date: "2026-08-12", period: "day" }), // within window
    ];
    const model = buildSearchReadModel({
      people: [me(), colleague()],
      events,
      shiftSchedule: schedule,
      meId: ME_ID,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.shiftEvents.map((event) => event.date)).toEqual(["2026-08-12"]);
  });

  it("carries meId, fetchedAt, and localNow straight through", () => {
    const model = buildSearchReadModel({
      people: [me()],
      events: [],
      shiftSchedule: schedule,
      meId: ME_ID,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.meId).toBe(ME_ID);
    expect(model.fetchedAt).toBe("2026-08-12T08:00:00.000Z");
    expect(model.localNow).toEqual(localNow());
  });

  it("preserves shadow/role/certainty per shift event", () => {
    const events = [
      shiftEvent({ date: "2026-08-12", period: "day", role: "supervisor", shadow: true, certainty: "tentative" }),
    ];
    const model = buildSearchReadModel({
      people: [me(), colleague()],
      events,
      shiftSchedule: schedule,
      meId: ME_ID,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.shiftEvents[0]).toMatchObject({ role: "supervisor", shadow: true, certainty: "tentative" });
  });

  it("output is deterministic regardless of input event order", () => {
    const events = [
      shiftEvent({ date: "2026-08-13", period: "night", personId: ME_ID }),
      shiftEvent({ date: "2026-08-12", period: "day" }),
    ];
    const forward = buildSearchReadModel({
      people: [me(), colleague()],
      events,
      shiftSchedule: schedule,
      meId: ME_ID,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });
    const reversed = buildSearchReadModel({
      people: [colleague(), me()],
      events: [...events].reverse(),
      shiftSchedule: schedule,
      meId: ME_ID,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(JSON.stringify(forward.roster)).toBe(JSON.stringify(reversed.roster));
    expect(JSON.stringify(forward.shiftEvents)).toBe(JSON.stringify(reversed.shiftEvents));
  });
});
