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

  it("a different date in a DIFFERENT calendar week for the same family/slot is NOT covered, even for guard/reserve", () => {
    // 2026-08-20 is a Thursday (week of 16-22 Aug); 2026-08-30 is a Sunday
    // two full weeks later -- genuinely a different requirement, not a
    // same-week swap.
    const events = buildPotentialDutyEvents(
      [allocation({ date: "2026-08-30", dutyFamily: "guard", slot: 1 })],
      NADAV,
      PERSONNEL,
      [dutyEvent({ date: "2026-08-20", dutyFamily: "guard", slot: 1 })],
    );
    expect(events).toHaveLength(1);
  });

  it("a different date in the SAME calendar week for the same family/slot IS covered for guard/reserve -- the slot is one continuous requirement across its week, not a per-day one", () => {
    // 2026-08-20 (Thu) and 2026-08-18 (Tue) fall in the same Sun-Sat week
    // (16-22 Aug) -- e.g. a real internal swap moved the same guard slot 1
    // requirement a couple of days later within the same week.
    const events = buildPotentialDutyEvents(
      [allocation({ date: "2026-08-18", dutyFamily: "guard", slot: 1 })],
      NADAV,
      PERSONNEL,
      [dutyEvent({ date: "2026-08-20", dutyFamily: "guard", slot: 1 })],
    );
    expect(events).toHaveLength(0);
  });

  it("a different date in the SAME calendar week for a NON-slotted family is still NOT covered -- the week-based rule is scoped to guard/reserve only", () => {
    // oxid carries no real internal slot at all (`slot: null` on both
    // sides) -- it never gets the guard/reserve "same continuous
    // requirement across the week" treatment, so exact-date dedup applies
    // unchanged even within the same week.
    const events = buildPotentialDutyEvents(
      [allocation({ date: "2026-08-18", dutyFamily: "oxid", slot: null, columnLabel: "אוקסיד 1" })],
      NADAV,
      PERSONNEL,
      [dutyEvent({ date: "2026-08-20", dutyFamily: "oxid", slot: null, title: "אוקסיד" })],
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

describe("buildPotentialDutyEvents — production swap regression (איתי/שירלי-shaped, synthetic names): a stale same-week Potential entry never survives a real internal guard/reserve swap", () => {
  const ITAY = person({ id: "p_itay", name: "איתן בדיקה" });
  const SHIRLEY = person({ id: "p_shirley", name: "שירה בדיקה" });
  const SWAP_PERSONNEL = [ITAY, SHIRLEY];

  // Original Potential plan (before the real-world swap): Itay guard-4
  // from 06/09, Shirley guard-4 from 08/09. The real internal schedule was
  // later swapped: Shirley actually got 06-08/09, Itay actually got
  // 08-10/09 -- all within the SAME Sunday-Saturday week (06-12 Sep 2026).

  it("Itay: his stale 06/09 Potential entry is suppressed by his real 08-10/09 guard-4 duty in the SAME week", () => {
    const itayRealDuty = [
      dutyEvent({ personId: ITAY.id, personName: ITAY.name, date: "2026-09-08", dutyFamily: "guard", slot: 4 }),
      dutyEvent({ personId: ITAY.id, personName: ITAY.name, date: "2026-09-09", dutyFamily: "guard", slot: 4 }),
      dutyEvent({ personId: ITAY.id, personName: ITAY.name, date: "2026-09-10", dutyFamily: "guard", slot: 4 }),
    ];
    const events = buildPotentialDutyEvents(
      [
        allocation({
          date: "2026-09-06",
          dutyFamily: "guard",
          slot: 4,
          columnLabel: "שומר 4",
          sourceAllocationLabel: ITAY.name,
        }),
      ],
      ITAY,
      SWAP_PERSONNEL,
      itayRealDuty,
    );
    expect(events).toHaveLength(0);
  });

  it("Shirley: her genuinely-covered 08/09 Potential entry stays suppressed (already true before this fix, still true after)", () => {
    const shirleyRealDuty = [
      dutyEvent({ personId: SHIRLEY.id, personName: SHIRLEY.name, date: "2026-09-06", dutyFamily: "guard", slot: 4 }),
      dutyEvent({ personId: SHIRLEY.id, personName: SHIRLEY.name, date: "2026-09-07", dutyFamily: "guard", slot: 4 }),
      dutyEvent({ personId: SHIRLEY.id, personName: SHIRLEY.name, date: "2026-09-08", dutyFamily: "guard", slot: 4 }),
    ];
    const events = buildPotentialDutyEvents(
      [
        allocation({
          date: "2026-09-08",
          dutyFamily: "guard",
          slot: 4,
          columnLabel: "שומר 4",
          sourceAllocationLabel: SHIRLEY.name,
        }),
      ],
      SHIRLEY,
      SWAP_PERSONNEL,
      shirleyRealDuty,
    );
    expect(events).toHaveLength(0);
  });

  it("anti-regression: a normal shift-capable person's genuinely FUTURE guard slot with NO corresponding real duty anywhere in that week still surfaces as a tentative Potential duty -- the fallback is not destroyed", () => {
    // Itay has a personal schedule column in general, but nothing real at
    // all yet for the week of 2026-09-06 -- this is a genuine gap, not a
    // stale/superseded entry, so Potential must still fill it in.
    const events = buildPotentialDutyEvents(
      [
        allocation({
          date: "2026-09-06",
          dutyFamily: "guard",
          slot: 4,
          columnLabel: "שומר 4",
          sourceAllocationLabel: ITAY.name,
        }),
      ],
      ITAY,
      SWAP_PERSONNEL,
      [], // no real duty Events at all for Itay
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: "2026-09-06", dutyFamily: "guard", slot: 4, certainty: "tentative" });
  });

  it("anti-regression: a real duty for the SAME slot but a DIFFERENT week never suppresses a genuinely separate Potential requirement", () => {
    const events = buildPotentialDutyEvents(
      [
        allocation({
          date: "2026-09-06",
          dutyFamily: "guard",
          slot: 4,
          columnLabel: "שומר 4",
          sourceAllocationLabel: ITAY.name,
        }),
      ],
      ITAY,
      SWAP_PERSONNEL,
      [
        // A guard-4 duty the week before -- a different, already-completed
        // requirement, never evidence that 06/09's requirement is stale.
        dutyEvent({ personId: ITAY.id, personName: ITAY.name, date: "2026-08-30", dutyFamily: "guard", slot: 4 }),
      ],
    );
    expect(events).toHaveLength(1);
  });
});

describe("buildPotentialDutyEvents — one-to-one guard/reserve reconciliation (multiplicity): one real confirmed block may supersede AT MOST ONE Potential allocation, never every allocation sharing its week/slot", () => {
  const ITAY = person({ id: "p_itay", name: "איתן בדיקה" });
  const PERSONNEL_WITH_ITAY = [ITAY];

  // 2026-09-06 (Sun) and 2026-09-09 (Wed) are the SAME Sun-Sat week
  // (06-12 Sep 2026) -- the real workbook shape this whole describe block
  // is modeled on: the SAME guard/reserve slot can carry TWO distinct
  // requirements in one week (a first-half and a second-half block).
  const FIRST_HALF_DATE = "2026-09-06";
  const SECOND_HALF_DATE = "2026-09-09";
  const DIFFERENT_WEEK_DATE = "2026-09-27"; // three weeks later -- unambiguously a different week

  function guardAllocation(date: string, overrides: Partial<PotentialAllocation> = {}): PotentialAllocation {
    return allocation({
      date,
      dutyFamily: "guard",
      slot: 4,
      columnLabel: "שומר 4",
      sourceAllocationLabel: ITAY.name,
      ...overrides,
    });
  }

  function reserveAllocation(date: string, overrides: Partial<PotentialAllocation> = {}): PotentialAllocation {
    return allocation({
      date,
      dutyFamily: "reserve",
      slot: 1,
      sourceSlot: 1,
      columnLabel: "עתודה 1",
      sourceAllocationLabel: ITAY.name,
      ...overrides,
    });
  }

  function realGuardDuty(date: string): Event {
    return dutyEvent({ personId: ITAY.id, personName: ITAY.name, date, dutyFamily: "guard", slot: 4 });
  }

  function realReserveDuty(date: string): Event {
    return dutyEvent({ personId: ITAY.id, personName: ITAY.name, date, dutyFamily: "reserve", slot: 1, title: "עתודה 1" });
  }

  it("3. MULTIPLICITY ANTI-REGRESSION (guard): two same-week Potential guard-4 allocations, only ONE confirmed block -- exactly ONE is suppressed, the other stays tentative", () => {
    const firstHalf = guardAllocation(FIRST_HALF_DATE);
    const secondHalf = guardAllocation(SECOND_HALF_DATE);
    // The single confirmed block exactly matches the second half only.
    const events = buildPotentialDutyEvents([firstHalf, secondHalf], ITAY, PERSONNEL_WITH_ITAY, [
      realGuardDuty(SECOND_HALF_DATE),
    ]);
    expect(events).toEqual([expect.objectContaining({ date: FIRST_HALF_DATE, certainty: "tentative" })]);
  });

  it("4. the SAME multiplicity case with reserve", () => {
    const firstHalf = reserveAllocation(FIRST_HALF_DATE);
    const secondHalf = reserveAllocation(SECOND_HALF_DATE);
    const events = buildPotentialDutyEvents([firstHalf, secondHalf], ITAY, PERSONNEL_WITH_ITAY, [
      realReserveDuty(SECOND_HALF_DATE),
    ]);
    expect(events).toEqual([expect.objectContaining({ date: FIRST_HALF_DATE, dutyFamily: "reserve", certainty: "tentative" })]);
  });

  it("5. two Potential allocations + two confirmed blocks -- both reconcile via exact date, no tentative leftovers", () => {
    const firstHalf = guardAllocation(FIRST_HALF_DATE);
    const secondHalf = guardAllocation(SECOND_HALF_DATE);
    const events = buildPotentialDutyEvents([firstHalf, secondHalf], ITAY, PERSONNEL_WITH_ITAY, [
      realGuardDuty(FIRST_HALF_DATE),
      realGuardDuty(SECOND_HALF_DATE),
    ]);
    expect(events).toEqual([]);
  });

  it("6. no confirmed block at all -- both Potential allocations remain tentative", () => {
    const firstHalf = guardAllocation(FIRST_HALF_DATE);
    const secondHalf = guardAllocation(SECOND_HALF_DATE);
    const events = buildPotentialDutyEvents([firstHalf, secondHalf], ITAY, PERSONNEL_WITH_ITAY, []);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.date).sort()).toEqual([FIRST_HALF_DATE, SECOND_HALF_DATE].sort());
  });

  it("7. a confirmed block for a DIFFERENT slot never consumes the allocation, even on the exact same date", () => {
    const events = buildPotentialDutyEvents(
      [guardAllocation(FIRST_HALF_DATE)],
      ITAY,
      PERSONNEL_WITH_ITAY,
      [dutyEvent({ personId: ITAY.id, personName: ITAY.name, date: FIRST_HALF_DATE, dutyFamily: "guard", slot: 2 })],
    );
    expect(events).toHaveLength(1);
  });

  it("8. a confirmed block for a DIFFERENT family never consumes the allocation, even on the exact same date and matching slot number", () => {
    const events = buildPotentialDutyEvents(
      [guardAllocation(FIRST_HALF_DATE)],
      ITAY,
      PERSONNEL_WITH_ITAY,
      [dutyEvent({ personId: ITAY.id, personName: ITAY.name, date: FIRST_HALF_DATE, dutyFamily: "reserve", slot: 4, title: "עתודה" })],
    );
    expect(events).toHaveLength(1);
  });

  it("9. a confirmed block in a DIFFERENT week/cycle never consumes the allocation", () => {
    const events = buildPotentialDutyEvents(
      [guardAllocation(FIRST_HALF_DATE)],
      ITAY,
      PERSONNEL_WITH_ITAY,
      [realGuardDuty(DIFFERENT_WEEK_DATE)],
    );
    expect(events).toHaveLength(1);
  });

  it("10. exact-date matching always wins first -- a same-week allocation with NO exact match never steals the block from another allocation that DOES have one, regardless of input order", () => {
    const noExactMatch = guardAllocation(FIRST_HALF_DATE); // no real duty this exact date
    const hasExactMatch = guardAllocation(SECOND_HALF_DATE); // real duty exists exactly here
    const block = [realGuardDuty(SECOND_HALF_DATE)];

    const forwardOrder = buildPotentialDutyEvents([noExactMatch, hasExactMatch], ITAY, PERSONNEL_WITH_ITAY, block);
    expect(forwardOrder).toEqual([expect.objectContaining({ date: FIRST_HALF_DATE })]);

    const reverseOrder = buildPotentialDutyEvents([hasExactMatch, noExactMatch], ITAY, PERSONNEL_WITH_ITAY, block);
    expect(reverseOrder).toEqual([expect.objectContaining({ date: FIRST_HALF_DATE })]);
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

  it("the swap regression holds roster-wide too -- the SAME reconciliation feeds Manager Overview / the 'all' calendar / Duty Fairness, never a second implementation", () => {
    const ITAY = person({ id: "p_itay", name: "איתן בדיקה" });
    const events = buildPotentialDutyEventsForRoster(
      [
        allocation({
          date: "2026-09-06",
          dutyFamily: "guard",
          slot: 4,
          columnLabel: "שומר 4",
          sourceAllocationLabel: ITAY.name,
        }),
      ],
      [...PERSONNEL, ITAY],
      [
        dutyEvent({ personId: ITAY.id, personName: ITAY.name, date: "2026-09-08", dutyFamily: "guard", slot: 4 }),
        dutyEvent({ personId: ITAY.id, personName: ITAY.name, date: "2026-09-09", dutyFamily: "guard", slot: 4 }),
        dutyEvent({ personId: ITAY.id, personName: ITAY.name, date: "2026-09-10", dutyFamily: "guard", slot: 4 }),
      ],
    );
    expect(events).toHaveLength(0);
  });

  it("never mutates the input events array", () => {
    const events = Object.freeze([Object.freeze(dutyEvent({ personId: YUVAL.id, date: "2026-01-01" }))]);
    expect(() => buildPotentialDutyEventsForRoster([allocation()], PERSONNEL, events)).not.toThrow();
  });
});
