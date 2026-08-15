import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/domain/event";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import { getOperationalWeek } from "@/lib/domain/operationalWeek";
import type { LocalNow } from "@/lib/domain/localNow";
import { computeSemanticFacts } from "./semanticFacts";

const schedule = buildShiftSchedule("07:00");
const week = getOperationalWeek({ date: "2026-08-19", minuteOfDay: 0 } as LocalNow);

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

describe("computeSemanticFacts -- shift facts", () => {
  it("produces one shift fact per (person, date) with the assigned period", () => {
    const facts = computeSemanticFacts(
      [event({ personId: "p1", date: "2026-08-18", category: "shift", period: "day", role: "technician" })],
      schedule,
      week,
    );
    const fact = facts.get("shift:p1:2026-08-18");
    expect(fact?.value).toEqual({ entries: [{ period: "day", role: "technician", shadow: false }] });
  });

  it("does not create a shift fact for a person/date with no shift event", () => {
    const facts = computeSemanticFacts([], schedule, week);
    expect(facts.has("shift:p1:2026-08-18")).toBe(false);
  });

  it("ignores non-shift events entirely", () => {
    const facts = computeSemanticFacts(
      [event({ personId: "p1", date: "2026-08-18", category: "absence" })],
      schedule,
      week,
    );
    expect(facts.has("shift:p1:2026-08-18")).toBe(false);
  });
});

describe("computeSemanticFacts -- team facts", () => {
  it("lists every OTHER non-shadow person on the same date+period, excluding the viewer themselves", () => {
    const events = [
      event({ personId: "p1", date: "2026-08-18", category: "shift", period: "day", role: "technician" }),
      event({ personId: "p2", date: "2026-08-18", category: "shift", period: "day", role: "supervisor" }),
      event({ personId: "p3", date: "2026-08-18", category: "shift", period: "night", role: "technician" }),
    ];
    const facts = computeSemanticFacts(events, schedule, week);

    expect(facts.get("team:p1:2026-08-18:day")?.value).toEqual({ colleagues: ["p2"] });
    expect(facts.get("team:p2:2026-08-18:day")?.value).toEqual({ colleagues: ["p1"] });
    // p3 is alone on the night shift -- an empty roster is still a real fact.
    expect(facts.get("team:p3:2026-08-18:night")?.value).toEqual({ colleagues: [] });
  });

  it("never includes a shadow colleague in the primary roster", () => {
    const events = [
      event({ personId: "p1", date: "2026-08-18", category: "shift", period: "day", role: "technician" }),
      event({
        personId: "p2",
        date: "2026-08-18",
        category: "shift",
        period: "day",
        role: "technician",
        shadow: true,
      }),
    ];
    const facts = computeSemanticFacts(events, schedule, week);
    expect(facts.get("team:p1:2026-08-18:day")?.value).toEqual({ colleagues: [] });
  });
});

describe("computeSemanticFacts -- duty facts", () => {
  it("produces one duty fact per (person, date) with every duty family/slot assigned", () => {
    const events = [
      event({ personId: "p1", date: "2026-08-18", category: "duty", dutyFamily: "guard", slot: 2 }),
    ];
    const facts = computeSemanticFacts(events, schedule, week);
    expect(facts.get("duty:p1:2026-08-18")?.value).toEqual({ entries: [{ dutyFamily: "guard", slot: 2 }] });
  });

  it("evacuation_on_call duties still produce a normal duty fact (no special exclusion here -- the exclusion is only for the removed check-in reminder, not change facts)", () => {
    const events = [event({ personId: "p1", date: "2026-08-18", category: "duty", dutyFamily: "evacuation_on_call" })];
    const facts = computeSemanticFacts(events, schedule, week);
    expect(facts.get("duty:p1:2026-08-18")?.value).toEqual({
      entries: [{ dutyFamily: "evacuation_on_call", slot: null }],
    });
  });
});

describe("computeSemanticFacts -- coverage facts", () => {
  it("reuses the two-supervisor waiver: a technician-missing shift with 2+ supervisors is 'full', not a gap", () => {
    const events = [
      event({ personId: "s1", date: "2026-08-18", category: "shift", period: "day", role: "supervisor" }),
      event({ personId: "s2", date: "2026-08-18", category: "shift", period: "day", role: "supervisor" }),
    ];
    const facts = computeSemanticFacts(events, schedule, week);
    expect(facts.get("coverage:2026-08-18:day")?.value).toEqual({
      status: "full",
      missingTechnician: false,
      missingSupervisor: false,
    });
  });

  it("flags a genuinely missing supervisor", () => {
    const events = [
      event({ personId: "t1", date: "2026-08-18", category: "shift", period: "day", role: "technician" }),
    ];
    const facts = computeSemanticFacts(events, schedule, week);
    expect(facts.get("coverage:2026-08-18:day")?.value).toEqual({
      status: "missing",
      missingTechnician: false,
      missingSupervisor: true,
    });
  });

  it("never stores a coverage fact for an unevaluable period (morning/unspecified)", () => {
    const events = [
      event({ personId: "p1", date: "2026-08-18", category: "shift", period: "morning", role: "technician" }),
    ];
    const facts = computeSemanticFacts(events, schedule, week);
    expect([...facts.keys()].some((key) => key.startsWith("coverage:2026-08-18:morning"))).toBe(false);
  });
});

describe("computeSemanticFacts -- current week restriction", () => {
  it("callers are expected to pre-filter events to week.dates -- an out-of-week event passed in still produces a fact (documented caller responsibility)", () => {
    // This test documents the contract: computeSemanticFacts itself does
    // not filter by week, the caller (changeDetection.ts) does. Passing
    // an out-of-week event here still produces a fact, proving the
    // "current week only" guarantee lives at the call site, not here.
    const events = [event({ personId: "p1", date: "2026-09-01", category: "shift", period: "day" })];
    const facts = computeSemanticFacts(events, schedule, week);
    expect(facts.has("shift:p1:2026-09-01")).toBe(true);
  });
});
