import { describe, expect, it } from "vitest";
import type { Event } from "./event";
import type { PotentialAllocation } from "./potentialAllocation";
import { buildPotentialDutyEvents, buildPotentialDutyEventsForRoster } from "./potentialDutyEvents";
import type { Person } from "./types";

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_x",
    name: "שם",
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

const NADAV = person({ id: "p_nadav", name: "נדב דוגמה" });
const YUVAL = person({ id: "p_yuval", name: "יובל דוגמה" });
const DANIEL_A = person({ id: "p_daniel_a", name: "דניאל א" });
const DANIEL_B = person({ id: "p_daniel_b", name: "דניאל ב" });
const PERSONNEL = [NADAV, YUVAL, DANIEL_A, DANIEL_B];

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function allocation(overrides: Partial<PotentialAllocation> = {}): PotentialAllocation {
  return {
    date: "2026-08-20",
    dutyFamily: "guard",
    slot: 1,
    sourceSlot: 1,
    columnLabel: "שומר 1",
    sourceAllocationLabel: "נדב דוגמה",
    resolvedSourcePersonId: null,
    sourceSheet: 'פוטנציאל תקש"אס 7-12/2026',
    sourceCell: nextCell(),
    ...overrides,
  };
}

function dutyEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: NADAV.id,
    personName: NADAV.name,
    date: "2026-08-20",
    title: "שומר 1",
    rawValue: "שומר 1",
    category: "duty",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: nextCell(),
    slot: 1,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: "guard",
    ...overrides,
    absenceKind: null,
  };
}

describe("buildPotentialDutyEvents — person resolution reuses the existing generic resolver", () => {
  it("resolves via an exact full-name match", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ sourceAllocationLabel: "נדב דוגמה" })],
      NADAV,
      PERSONNEL,
      [],
    );
    expect(events).toHaveLength(1);
    expect(events[0].personId).toBe(NADAV.id);
  });

  it("resolves via a unique short (leading-token) name", () => {
    const events = buildPotentialDutyEvents([allocation({ sourceAllocationLabel: "נדב" })], NADAV, PERSONNEL, []);
    expect(events).toHaveLength(1);
    expect(events[0].personId).toBe(NADAV.id);
  });

  it("resolves an annotated short-name label ('name - note') via the leading token only", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ sourceAllocationLabel: "נדב - הוקפץ" })],
      NADAV,
      PERSONNEL,
      [],
    );
    expect(events).toHaveLength(1);
  });

  it("an ambiguous short name (two personnel -- 'דניאל א'/'דניאל ב' -- share the leading token 'דניאל') never resolves to either person, no guessing", () => {
    const ambiguous = allocation({ sourceAllocationLabel: "דניאל" });
    const forA = buildPotentialDutyEvents([ambiguous], DANIEL_A, PERSONNEL, []);
    const forB = buildPotentialDutyEvents([ambiguous], DANIEL_B, PERSONNEL, []);
    expect(forA).toHaveLength(0);
    expect(forB).toHaveLength(0);
  });

  it("the SAME two people's full names still resolve unambiguously via an exact full-name match", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ sourceAllocationLabel: "דניאל א" })],
      DANIEL_A,
      PERSONNEL,
      [],
    );
    expect(events).toHaveLength(1);
    expect(events[0].personId).toBe(DANIEL_A.id);
  });

  it("a team-alias label (e.g. תקש\"ל) never attributes to any specific person", () => {
    const events = buildPotentialDutyEvents([allocation({ sourceAllocationLabel: 'תקש"ל' })], NADAV, PERSONNEL, []);
    expect(events).toHaveLength(0);
  });

  it("an external-organization label never attributes to a same-named person", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ sourceAllocationLabel: "סייבר" })],
      NADAV,
      PERSONNEL,
      [],
    );
    expect(events).toHaveLength(0);
  });

  it("an unresolvable/unknown source label produces nothing for anyone", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ sourceAllocationLabel: "מישהו שלא קיים" })],
      NADAV,
      PERSONNEL,
      [],
    );
    expect(events).toHaveLength(0);
  });

  it("an allocation resolved to one person never leaks into another person's result", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ sourceAllocationLabel: "נדב דוגמה" })],
      YUVAL,
      PERSONNEL,
      [],
    );
    expect(events).toHaveLength(0);
  });
});

describe("buildPotentialDutyEvents — dedup against an existing internal duty Event", () => {
  it("an allocation already covered by a real internal duty Event (same date+family+slot) is dropped -- never a duplicate", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 1 })],
      NADAV,
      PERSONNEL,
      [dutyEvent({ date: "2026-08-20", dutyFamily: "guard", slot: 1 })],
    );
    expect(events).toHaveLength(0);
  });

  it("a DIFFERENT slot on the same date is NOT covered -- guard slot 1 internally never suppresses a genuinely separate slot 2 allocation", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 2, columnLabel: "שומר 2" })],
      NADAV,
      PERSONNEL,
      [dutyEvent({ date: "2026-08-20", dutyFamily: "guard", slot: 1 })],
    );
    expect(events).toHaveLength(1);
  });

  it("a different duty family on the same date is NOT covered", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ date: "2026-08-20", dutyFamily: "oxid", slot: null, columnLabel: "אוקסיד 1" })],
      NADAV,
      PERSONNEL,
      [dutyEvent({ date: "2026-08-20", dutyFamily: "guard", slot: 1 })],
    );
    expect(events).toHaveLength(1);
  });

  it("a different date for the same family/slot is NOT covered", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ date: "2026-08-21", dutyFamily: "guard", slot: 1 })],
      NADAV,
      PERSONNEL,
      [dutyEvent({ date: "2026-08-20", dutyFamily: "guard", slot: 1 })],
    );
    expect(events).toHaveLength(1);
  });

  it("multiplicity families (null internal slot on both sides) dedup by date+family alone, ignoring slot", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ date: "2026-08-20", dutyFamily: "oxid", slot: null, sourceSlot: 2, columnLabel: "אוקסיד 2" })],
      NADAV,
      PERSONNEL,
      [dutyEvent({ date: "2026-08-20", dutyFamily: "oxid", slot: null, title: "אוקסיד" })],
    );
    expect(events).toHaveLength(0);
  });

  it("a normal department person's fully-represented duty produces ZERO synthetic events -- existing behavior is unaffected", () => {
    const guardDuty = dutyEvent({ date: "2026-08-20", dutyFamily: "guard", slot: 1 });
    const events = buildPotentialDutyEvents(
      [allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 1, sourceAllocationLabel: "נדב דוגמה" })],
      NADAV,
      PERSONNEL,
      [guardDuty],
    );
    expect(events).toHaveLength(0);
  });
});

describe("buildPotentialDutyEvents — shape of the synthetic Event", () => {
  it("is always category 'duty' with certainty 'tentative' -- never presented as confirmed as a real internal Event", () => {
    const events = buildPotentialDutyEvents([allocation()], NADAV, PERSONNEL, []);
    expect(events[0].category).toBe("duty");
    expect(events[0].certainty).toBe("tentative");
  });

  it("carries the allocation's dutyFamily/slot/date through unchanged", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ date: "2026-09-01", dutyFamily: "reserve", slot: 2, columnLabel: "עתודה 2" })],
      NADAV,
      PERSONNEL,
      [],
    );
    expect(events[0]).toMatchObject({ date: "2026-09-01", dutyFamily: "reserve", slot: 2 });
  });

  it("never sets role/period as if it were a shift -- role null, period unspecified, same as a real duty Event", () => {
    const events = buildPotentialDutyEvents([allocation()], NADAV, PERSONNEL, []);
    expect(events[0].role).toBeNull();
    expect(events[0].period).toBe("unspecified");
  });

  it("carries personId/personName for the resolved person, not the raw source label", () => {
    const events = buildPotentialDutyEvents(
      [allocation({ sourceAllocationLabel: "נדב" })],
      NADAV,
      PERSONNEL,
      [],
    );
    expect(events[0].personId).toBe(NADAV.id);
    expect(events[0].personName).toBe(NADAV.name);
  });
});

describe("buildPotentialDutyEvents — determinism and input safety", () => {
  it("produces one Event per surviving allocation, in input order -- grouping into blocks is buildDutyBlocks' job, not this function's", () => {
    const events = buildPotentialDutyEvents(
      [
        allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 1 }),
        allocation({ date: "2026-08-21", dutyFamily: "guard", slot: 1 }),
      ],
      NADAV,
      PERSONNEL,
      [],
    );
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.date)).toEqual(["2026-08-20", "2026-08-21"]);
  });

  it("never mutates the input allocations/personnel/personDutyEvents", () => {
    const allocations = Object.freeze([Object.freeze(allocation())]);
    const personnel = Object.freeze([...PERSONNEL]);
    const personDutyEvents = Object.freeze([Object.freeze(dutyEvent({ date: "2026-01-01" }))]);
    expect(() => buildPotentialDutyEvents(allocations, NADAV, personnel, personDutyEvents)).not.toThrow();
  });
});

describe("buildPotentialDutyEventsForRoster — the same per-person conversion, run across a whole roster", () => {
  it("produces one synthetic Event per person whose allocation resolves and isn't already covered", () => {
    const events = buildPotentialDutyEventsForRoster(
      [
        allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 1, sourceAllocationLabel: "נדב דוגמה" }),
        allocation({ date: "2026-08-21", dutyFamily: "oxid", slot: null, sourceAllocationLabel: "יובל דוגמה" }),
      ],
      PERSONNEL,
      [],
    );
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.personId).sort()).toEqual([NADAV.id, YUVAL.id].sort());
  });

  it("a person whose duty is already a real internal Event never gets a roster-wide duplicate", () => {
    const events = buildPotentialDutyEventsForRoster(
      [allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 1, sourceAllocationLabel: "נדב דוגמה" })],
      PERSONNEL,
      [dutyEvent({ personId: NADAV.id, personName: NADAV.name, date: "2026-08-20", dutyFamily: "guard", slot: 1 })],
    );
    expect(events).toHaveLength(0);
  });

  it("ambiguous ownership excludes the allocation for every person in the roster, not just one", () => {
    const events = buildPotentialDutyEventsForRoster(
      [allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 1, sourceAllocationLabel: "דניאל" })],
      PERSONNEL,
      [],
    );
    expect(events).toHaveLength(0);
  });

  it("never mutates the input events array", () => {
    const events = Object.freeze([Object.freeze(dutyEvent({ personId: YUVAL.id, date: "2026-01-01" }))]);
    expect(() => buildPotentialDutyEventsForRoster([allocation()], PERSONNEL, events)).not.toThrow();
  });
});
