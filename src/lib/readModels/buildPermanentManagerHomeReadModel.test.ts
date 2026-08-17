import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { buildPermanentManagerHomeReadModel } from "./buildPermanentManagerHomeReadModel";

// day 07:30-19:30, night 19:30-07:30(+1)
const schedule = buildShiftSchedule("07:30");

const MANAGER_ID = "p_manager";

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function manager(overrides: Partial<Person> = {}): Person {
  return {
    id: MANAGER_ID,
    name: "מנהל בדיקה",
    email: "manager@example.invalid",
    isManager: true,
    isTechnician: false,
    isSupervisor: false,
    personnelType: "קבע",
    ...overrides,
  };
}

function person(id: string, name: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    name,
    email: `${id}@example.invalid`,
    isManager: false,
    isTechnician: true,
    isSupervisor: false,
    personnelType: "קבע",
    ...overrides,
  };
}

function shiftEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_tech",
    personName: "טכנאי בדיקה",
    date: "2026-08-12",
    title: "טכנאי יום",
    rawValue: "טכנאי יום",
    category: "shift",
    certainty: "confirmed",
    role: "technician",
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
  return { date: "2026-08-12", minuteOfDay: 8 * 60, ...overrides };
}

describe("buildPermanentManagerHomeReadModel — shift identity", () => {
  it("previous/current/next follow the canonical day/night timeline around `now`", () => {
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager()],
      events: [],
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow({ date: "2026-08-12", minuteOfDay: 8 * 60 }), // 08:00 -> today's day shift
    });

    expect(model.previousShift.date).toBe("2026-08-11");
    expect(model.previousShift.period).toBe("night");
    expect(model.currentShift.date).toBe("2026-08-12");
    expect(model.currentShift.period).toBe("day");
    expect(model.nextShift.date).toBe("2026-08-12");
    expect(model.nextShift.period).toBe("night");
  });

  it("crosses midnight correctly: shortly after midnight, current is still yesterday's night shift", () => {
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager()],
      events: [],
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T02:00:00.000Z",
      now: localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 }), // 02:00
    });

    expect(model.currentShift.date).toBe("2026-08-11");
    expect(model.currentShift.period).toBe("night");
    expect(model.previousShift.date).toBe("2026-08-11");
    expect(model.previousShift.period).toBe("day");
    expect(model.nextShift.date).toBe("2026-08-12");
    expect(model.nextShift.period).toBe("day");
  });

  it("canonical hours are reported for every shift, not just the current one", () => {
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager()],
      events: [],
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.previousShift.startLocalTime).toBe("19:30");
    expect(model.previousShift.endLocalTime).toBe("07:30");
    expect(model.currentShift.startLocalTime).toBe("07:30");
    expect(model.currentShift.endLocalTime).toBe("19:30");
    expect(model.nextShift.startLocalTime).toBe("19:30");
    expect(model.nextShift.endLocalTime).toBe("07:30");
  });
});

describe("buildPermanentManagerHomeReadModel — staffing + coverage", () => {
  it("full coverage: a technician and a supervisor are both staffed on the current shift", () => {
    const events = [
      shiftEvent({ personId: "p_tech", personName: "טכנאי בדיקה", role: "technician", period: "day" }),
      shiftEvent({ personId: "p_sup", personName: "אחמש בדיקה", role: "supervisor", period: "day" }),
    ];
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager(), person("p_tech", "טכנאי בדיקה"), person("p_sup", "אחמש בדיקה")],
      events,
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.currentShift.coverageStatus).toBe("full");
    expect(model.currentShift.technicians.map((p) => p.personName)).toEqual(["טכנאי בדיקה"]);
    expect(model.currentShift.supervisors.map((p) => p.personName)).toEqual(["אחמש בדיקה"]);
  });

  it("missing supervisor: a technician alone leaves the supervisor role missing", () => {
    const events = [shiftEvent({ personId: "p_tech", role: "technician", period: "day" })];
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager(), person("p_tech", "טכנאי בדיקה")],
      events,
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.currentShift.coverageStatus).toBe("missing");
    expect(model.currentShift.roleCoverage.supervisor.status).toBe("missing");
    expect(model.currentShift.roleCoverage.technician.status).toBe("full");
  });

  it("missing technician: a supervisor alone leaves the technician role missing", () => {
    const events = [shiftEvent({ personId: "p_sup", role: "supervisor", period: "day" })];
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager(), person("p_sup", "אחמש בדיקה")],
      events,
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.currentShift.coverageStatus).toBe("missing");
    expect(model.currentShift.roleCoverage.technician.status).toBe("missing");
  });

  it("partial: a technician covers only part of the canonical window", () => {
    const events = [
      shiftEvent({ personId: "p_tech", role: "technician", period: "day", endTimeOverride: "12:00" }),
      shiftEvent({ personId: "p_sup", role: "supervisor", period: "day" }),
    ];
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager(), person("p_tech", "טכנאי בדיקה"), person("p_sup", "אחמש בדיקה")],
      events,
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.currentShift.coverageStatus).toBe("partial");
    expect(model.currentShift.missingIntervals).toEqual([{ startMinute: 720, endMinute: 1170 }]);
  });

  it("empty staffing: nobody at all assigned to the current shift is reported as missing, not omitted", () => {
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager()],
      events: [],
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.currentShift.coverageStatus).toBe("missing");
    expect(model.currentShift.technicians).toEqual([]);
    expect(model.currentShift.supervisors).toEqual([]);
    expect(model.currentShift.missingIntervals).toEqual([{ startMinute: 450, endMinute: 1170 }]);
    // Same "genuinely empty, not omitted" treatment applies to previous/next.
    expect(model.previousShift.coverageStatus).toBe("missing");
    expect(model.nextShift.coverageStatus).toBe("missing");
  });
});

describe("buildPermanentManagerHomeReadModel — live progress", () => {
  it("the current shift's timing is always resolved and reflects elapsed/remaining as of `now`", () => {
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager()],
      events: [],
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow({ date: "2026-08-12", minuteOfDay: 8 * 60 }), // 30 min into the 07:30 day shift
    });

    expect(model.currentShift.timing.status).toBe("resolved");
    expect(model.currentShift.timing.elapsedMinutesAtLoad).toBe(30);
    expect(model.currentShift.timing.durationMinutes).toBe(720);
    expect(model.currentShift.timing.remainingMinutesAtLoad).toBe(690);
  });
});

describe("buildPermanentManagerHomeReadModel — today's operational context", () => {
  it("includes only today's duties and absences, excluding other dates", () => {
    const events = [
      shiftEvent({
        personId: "p_duty",
        personName: "שומר בדיקה",
        category: "duty",
        role: null,
        period: "unspecified",
        date: "2026-08-12",
        dutyFamily: "guard",
        slot: 1,
        title: "שומר 1",
      }),
      shiftEvent({
        personId: "p_duty2",
        personName: "שומר מחר",
        category: "duty",
        role: null,
        period: "unspecified",
        date: "2026-08-13",
        dutyFamily: "guard",
        slot: 2,
        title: "שומר 2",
      }),
      shiftEvent({
        personId: "p_absent",
        personName: "נעדר בדיקה",
        category: "absence",
        role: null,
        period: "unspecified",
        date: "2026-08-12",
        absenceKind: "vacation",
        title: "חופש",
      }),
      shiftEvent({
        personId: "p_absent2",
        personName: "נעדר אתמול",
        category: "absence",
        role: null,
        period: "unspecified",
        date: "2026-08-11",
        absenceKind: "medical",
        title: "גימלים",
      }),
    ];

    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [
        manager(),
        person("p_duty", "שומר בדיקה"),
        person("p_duty2", "שומר מחר"),
        person("p_absent", "נעדר בדיקה"),
        person("p_absent2", "נעדר אתמול"),
      ],
      events,
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow({ date: "2026-08-12" }),
    });

    expect(model.todayDuties).toEqual([
      { personId: "p_duty", personName: "שומר בדיקה", dutyFamily: "guard", slot: 1 },
    ]);
    expect(model.todayAbsences).toEqual([
      { personId: "p_absent", personName: "נעדר בדיקה", absenceKind: "vacation" },
    ]);
  });

  it("an empty day produces empty duty/absence lists, never a fabricated entry", () => {
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager()],
      events: [],
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.todayDuties).toEqual([]);
    expect(model.todayAbsences).toEqual([]);
  });
});

describe("buildPermanentManagerHomeReadModel — data minimization", () => {
  it("today duty/absence rows carry only the safe, spec-listed fields", () => {
    const events = [
      shiftEvent({
        personId: "p_duty",
        personName: "שומר בדיקה",
        category: "duty",
        role: null,
        period: "unspecified",
        date: "2026-08-12",
        dutyFamily: "guard",
        slot: 1,
        title: "שומר 1",
        sourceCell: "Z99",
      }),
    ];
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager(), person("p_duty", "שומר בדיקה")],
      events,
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(Object.keys(model.todayDuties[0]).sort()).toEqual(["dutyFamily", "personId", "personName", "slot"]);
  });

  it("the read model's person profile carries no email", () => {
    const model = buildPermanentManagerHomeReadModel({
      person: manager(),
      people: [manager()],
      events: [],
      shiftSchedule: schedule,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      now: localNow(),
    });

    expect(model.person).not.toHaveProperty("email");
  });
});
