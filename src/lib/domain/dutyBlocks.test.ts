import { describe, expect, it } from "vitest";
import type { DutyFamily, Event } from "./event";
import { buildDutyBlocks, daysBetweenCalendarDates, isNextCalendarDay, parseCalendarDate } from "./dutyBlocks";

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function baseEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_test",
    personName: "דני בדיקה",
    date: "2026-01-05",
    title: "שומר 1",
    rawValue: "שומר 1",
    category: "duty",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
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

function dutyEvent(family: DutyFamily, overrides: Partial<Event> = {}): Event {
  return baseEvent({ category: "duty", dutyFamily: family, ...overrides });
}

function guardEvent(date: string, slot: number, overrides: Partial<Event> = {}): Event {
  return dutyEvent("guard", { date, slot, ...overrides });
}

function reserveEvent(date: string, slot: number, overrides: Partial<Event> = {}): Event {
  return dutyEvent("reserve", { date, slot, ...overrides });
}

function shiftEvent(overrides: Partial<Event> = {}): Event {
  return baseEvent({
    category: "shift",
    role: "technician",
    period: "day",
    dutyFamily: null,
    title: "טכנאי יום",
    rawValue: "טכנאי יום",
    ...overrides,
  });
}

describe("buildDutyBlocks — basic grouping", () => {
  it("1. one guard day -> one block", () => {
    const event = guardEvent("2026-01-05", 1);
    const blocks = buildDutyBlocks([event]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      personId: "p_test",
      dutyFamily: "guard",
      slot: 1,
      startDate: "2026-01-05",
      endDate: "2026-01-05",
      dayCount: 1,
    });
    expect(blocks[0].events).toEqual([event]);
  });

  it("2. three consecutive guard days -> one block, dayCount 3", () => {
    const e1 = guardEvent("2026-01-05", 1);
    const e2 = guardEvent("2026-01-06", 1);
    const e3 = guardEvent("2026-01-07", 1);
    const blocks = buildDutyBlocks([e1, e2, e3]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      startDate: "2026-01-05",
      endDate: "2026-01-07",
      dayCount: 3,
    });
    expect(blocks[0].dates).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"]);
  });

  it("3. a gap breaks the guard block", () => {
    const e1 = guardEvent("2026-01-05", 1);
    const e2 = guardEvent("2026-01-07", 1);
    const blocks = buildDutyBlocks([e1, e2]);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.startDate)).toEqual(["2026-01-05", "2026-01-07"]);
    expect(blocks.every((b) => b.dayCount === 1)).toBe(true);
  });

  it("4. a different guard slot breaks the block", () => {
    const slot1 = guardEvent("2026-01-05", 1);
    const slot2 = guardEvent("2026-01-06", 2);
    const blocks = buildDutyBlocks([slot1, slot2]);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.slot).sort()).toEqual([1, 2]);
  });

  it("5. same-slot consecutive reserve days merge", () => {
    const e1 = reserveEvent("2026-01-05", 2);
    const e2 = reserveEvent("2026-01-06", 2);
    const blocks = buildDutyBlocks([e1, e2]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ dutyFamily: "reserve", slot: 2, dayCount: 2 });
  });

  it("6. different people never merge, even with identical family/slot/dates", () => {
    const a = guardEvent("2026-01-05", 1, { personId: "p_a" });
    const b = guardEvent("2026-01-06", 1, { personId: "p_b" });
    const blocks = buildDutyBlocks([a, b]);
    expect(blocks).toHaveLength(2);
  });

  it("7. a different duty family never merges, even on consecutive dates", () => {
    const guard = guardEvent("2026-01-05", 1);
    const oxid = dutyEvent("oxid", { date: "2026-01-06", slot: 1 });
    const blocks = buildDutyBlocks([guard, oxid]);
    expect(blocks).toHaveLength(2);
  });

  it("8. a single oxid -> one-day block", () => {
    const event = dutyEvent("oxid", { date: "2026-01-05", slot: null });
    const blocks = buildDutyBlocks([event]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ dutyFamily: "oxid", dayCount: 1 });
  });

  it("9. a single rasar -> one-day block", () => {
    const event = dutyEvent("rasar", { date: "2026-01-05", slot: null });
    const blocks = buildDutyBlocks([event]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ dutyFamily: "rasar", dayCount: 1 });
  });

  it("10. multiple genuinely different Events on the same date are preserved, date counted once", () => {
    const a = guardEvent("2026-01-05", 1, { sourceCell: "C1" });
    const b = guardEvent("2026-01-05", 1, { sourceCell: "C2", certainty: "tentative" });
    const blocks = buildDutyBlocks([a, b]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].dayCount).toBe(1);
    expect(blocks[0].events).toHaveLength(2);
    expect(blocks[0].events).toEqual(expect.arrayContaining([a, b]));
  });

  it("11. a duplicated exact Event reference does not inflate dayCount", () => {
    const event = guardEvent("2026-01-05", 1);
    const blocks = buildDutyBlocks([event, event, event]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].dayCount).toBe(1);
    expect(blocks[0].events).toHaveLength(1);
  });

  it("12. Events supplied out of order still produce an ordered, deterministic block", () => {
    const e1 = guardEvent("2026-01-05", 1);
    const e2 = guardEvent("2026-01-06", 1);
    const e3 = guardEvent("2026-01-07", 1);
    const blocks = buildDutyBlocks([e3, e1, e2]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].events).toEqual([e1, e2, e3]);
    expect(blocks[0].dates).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"]);
  });
});

describe("buildDutyBlocks — local calendar-date arithmetic", () => {
  it("13. month boundary consecutive dates merge", () => {
    const e1 = guardEvent("2026-01-31", 1);
    const e2 = guardEvent("2026-02-01", 1);
    const blocks = buildDutyBlocks([e1, e2]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ startDate: "2026-01-31", endDate: "2026-02-01", dayCount: 2 });
  });

  it("14. year boundary consecutive dates merge", () => {
    const e1 = guardEvent("2026-12-31", 1);
    const e2 = guardEvent("2027-01-01", 1);
    const blocks = buildDutyBlocks([e1, e2]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ startDate: "2026-12-31", endDate: "2027-01-01", dayCount: 2 });
  });

  it("15. leap day is handled correctly (2028-02-28 -> 29 -> 03-01)", () => {
    const e1 = guardEvent("2028-02-28", 1);
    const e2 = guardEvent("2028-02-29", 1);
    const e3 = guardEvent("2028-03-01", 1);
    const blocks = buildDutyBlocks([e1, e2, e3]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ startDate: "2028-02-28", endDate: "2028-03-01", dayCount: 3 });
  });

  it("a non-leap year does not treat Feb 28 -> Mar 1 as a gap", () => {
    const e1 = guardEvent("2027-02-28", 1);
    const e2 = guardEvent("2027-03-01", 1);
    expect(isNextCalendarDay("2027-02-28", "2027-03-01")).toBe(true);
    const blocks = buildDutyBlocks([e1, e2]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].dayCount).toBe(2);
  });

  it("2027-02-29 does not exist and is correctly rejected", () => {
    expect(parseCalendarDate("2027-02-29")).toBeNull();
  });

  it("16. an invalid date never crashes grouping", () => {
    const invalid = guardEvent("2026-13-40", 1);
    expect(() => buildDutyBlocks([invalid])).not.toThrow();
    const blocks = buildDutyBlocks([invalid]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].events).toEqual([invalid]);
  });

  it("17. an invalid date does not silently join a valid consecutive block", () => {
    const valid = guardEvent("2026-01-05", 1);
    const invalid = guardEvent("2026-13-40", 1);
    const blocks = buildDutyBlocks([valid, invalid]);
    expect(blocks).toHaveLength(2);
    expect(blocks.some((b) => b.dayCount === 1 && b.startDate === "2026-01-05")).toBe(true);
    expect(blocks.some((b) => b.startDate === "2026-13-40")).toBe(true);
  });
});

describe("buildDutyBlocks — certainty", () => {
  it("18. all confirmed -> block certainty confirmed", () => {
    const e1 = guardEvent("2026-01-05", 1, { certainty: "confirmed" });
    const e2 = guardEvent("2026-01-06", 1, { certainty: "confirmed" });
    const blocks = buildDutyBlocks([e1, e2]);
    expect(blocks[0].certainty).toBe("confirmed");
  });

  it("19. all tentative -> tentative", () => {
    const e1 = guardEvent("2026-01-05", 1, { certainty: "tentative" });
    const e2 = guardEvent("2026-01-06", 1, { certainty: "tentative" });
    const blocks = buildDutyBlocks([e1, e2]);
    expect(blocks[0].certainty).toBe("tentative");
  });

  it("20. a mixture -> mixed", () => {
    const e1 = guardEvent("2026-01-05", 1, { certainty: "confirmed" });
    const e2 = guardEvent("2026-01-06", 1, { certainty: "tentative" });
    const blocks = buildDutyBlocks([e1, e2]);
    expect(blocks[0].certainty).toBe("mixed");
  });
});

describe("buildDutyBlocks — weekend kitchen", () => {
  it("21. a complete Thu/Fri/Sat weekend kitchen block is identified as complete", () => {
    // Verified against an independent calendar: 2026-01-01/02/03 are Thu/Fri/Sat.
    const events = [
      dutyEvent("weekend_kitchen", { date: "2026-01-01" }),
      dutyEvent("weekend_kitchen", { date: "2026-01-02" }),
      dutyEvent("weekend_kitchen", { date: "2026-01-03" }),
    ];
    const blocks = buildDutyBlocks(events);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].weekendCompleteness).toBe("complete");
  });

  it("22. a partial weekend kitchen (only two of the three days) is identified as partial", () => {
    const events = [
      dutyEvent("weekend_kitchen", { date: "2026-01-01" }),
      dutyEvent("weekend_kitchen", { date: "2026-01-02" }),
    ];
    const blocks = buildDutyBlocks(events);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].weekendCompleteness).toBe("partial");
  });

  it("a 3-day weekend_kitchen run NOT starting on Thursday is partial, not complete", () => {
    // 2026-01-05/06/07 are Mon/Tue/Wed, not Thu/Fri/Sat.
    const events = [
      dutyEvent("weekend_kitchen", { date: "2026-01-05" }),
      dutyEvent("weekend_kitchen", { date: "2026-01-06" }),
      dutyEvent("weekend_kitchen", { date: "2026-01-07" }),
    ];
    const blocks = buildDutyBlocks(events);
    expect(blocks[0].weekendCompleteness).toBe("partial");
  });

  it("23. weekend kitchen never fabricates a missing date -- only Thursday present stays a 1-day block", () => {
    const events = [dutyEvent("weekend_kitchen", { date: "2026-01-01" })];
    const blocks = buildDutyBlocks(events);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].dayCount).toBe(1);
    expect(blocks[0].dates).toEqual(["2026-01-01"]);
    expect(blocks[0].weekendCompleteness).toBe("partial");
  });

  it("weekendCompleteness is not_applicable for every other duty family", () => {
    const blocks = buildDutyBlocks([guardEvent("2026-01-05", 1)]);
    expect(blocks[0].weekendCompleteness).toBe("not_applicable");
  });
});

describe("buildDutyBlocks — non-duty and null-family safety", () => {
  it("24. an unrelated non-duty Event is ignored", () => {
    const shift = shiftEvent({ date: "2026-01-05" });
    expect(buildDutyBlocks([shift])).toEqual([]);
  });

  it("25. a duty Event with a null dutyFamily is ignored safely, never throwing", () => {
    const malformed = baseEvent({ category: "duty", dutyFamily: null });
    expect(() => buildDutyBlocks([malformed])).not.toThrow();
    expect(buildDutyBlocks([malformed])).toEqual([]);
  });

  it("does not mutate any Event or the input array", () => {
    const event = Object.freeze(guardEvent("2026-01-05", 1));
    const events = Object.freeze([event]);
    expect(() => buildDutyBlocks(events)).not.toThrow();
    expect(event.slot).toBe(1);
  });

  it("preserves the original Event reference inside the block", () => {
    const event = guardEvent("2026-01-05", 1);
    const blocks = buildDutyBlocks([event]);
    expect(blocks[0].events[0]).toBe(event);
  });

  it("output is deterministic and sorted by startDate, personId, family, slot", () => {
    const b = guardEvent("2026-01-06", 1, { personId: "p_b" });
    const a1 = guardEvent("2026-01-05", 2, { personId: "p_a" });
    const a2 = guardEvent("2026-01-05", 1, { personId: "p_a" });
    const blocksA = buildDutyBlocks([b, a1, a2]);
    const blocksB = buildDutyBlocks([a2, b, a1]);
    expect(blocksA.map((x) => [x.startDate, x.personId, x.slot])).toEqual([
      ["2026-01-05", "p_a", 1],
      ["2026-01-05", "p_a", 2],
      ["2026-01-06", "p_b", 1],
    ]);
    expect(blocksB.map((x) => [x.startDate, x.personId, x.slot])).toEqual(
      blocksA.map((x) => [x.startDate, x.personId, x.slot]),
    );
  });
});

describe("daysBetweenCalendarDates", () => {
  it("counts whole civil days within the same month", () => {
    expect(daysBetweenCalendarDates("2026-01-01", "2026-01-10")).toBe(9);
  });

  it("is 0 for the same date", () => {
    expect(daysBetweenCalendarDates("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("crosses a month boundary correctly", () => {
    expect(daysBetweenCalendarDates("2026-01-25", "2026-02-05")).toBe(11);
  });

  it("crosses a year boundary correctly", () => {
    expect(daysBetweenCalendarDates("2025-12-20", "2026-01-05")).toBe(16);
  });

  it("handles a leap-year February", () => {
    expect(daysBetweenCalendarDates("2028-02-01", "2028-03-01")).toBe(29);
  });

  it("is negative when endDate is before startDate", () => {
    expect(daysBetweenCalendarDates("2026-06-30", "2026-01-01")).toBe(-180);
  });

  it("returns null for an unparseable date on either side", () => {
    expect(daysBetweenCalendarDates("not-a-date", "2026-01-01")).toBeNull();
    expect(daysBetweenCalendarDates("2026-01-01", "also-bad")).toBeNull();
  });
});
