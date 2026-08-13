import { describe, expect, it } from "vitest";
import type { Event } from "./event";
import { buildShiftSchedule } from "./shiftSchedule";
import {
  analyzeShiftCounterparts,
  analyzeUnitShiftCoverage,
  clipInterval,
  computeMissingIntervals,
  mergeIntervals,
} from "./shiftCoverage";

const schedule = buildShiftSchedule("07:30"); // day 07:30-19:30, night 19:30-07:30(+1)

let personCounter = 0;
function nextPersonId(): string {
  personCounter += 1;
  return `p_${personCounter}`;
}

function shiftEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: nextPersonId(),
    personName: "דני בדיקה",
    date: "2026-01-05",
    title: "טכנאי יום",
    rawValue: "טכנאי יום",
    category: "shift",
    certainty: "confirmed",
    role: "technician",
    period: "day",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: "C2",
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

function supervisorDay(overrides: Partial<Event> = {}): Event {
  return shiftEvent({ role: "supervisor", period: "day", title: 'אחמ"ש יום', rawValue: 'אחמ"ש יום', ...overrides });
}

function technicianDay(overrides: Partial<Event> = {}): Event {
  return shiftEvent({ role: "technician", period: "day", ...overrides });
}

describe("analyzeShiftCounterparts — basic pairing", () => {
  it("6. supervisor day finds technician day", () => {
    const target = supervisorDay();
    const tech = technicianDay();
    const result = analyzeShiftCounterparts(target, [target, tech], schedule);
    expect(result.counterpartRole).toBe("technician");
    expect(result.primaryCounterparts).toEqual([tech]);
  });

  it("7. technician day finds supervisor day", () => {
    const target = technicianDay();
    const supervisor = supervisorDay();
    const result = analyzeShiftCounterparts(target, [target, supervisor], schedule);
    expect(result.counterpartRole).toBe("supervisor");
    expect(result.primaryCounterparts).toEqual([supervisor]);
  });

  it("8. supervisor night finds technician night", () => {
    const target = supervisorDay({ period: "night" });
    const tech = technicianDay({ period: "night" });
    const dayTech = technicianDay({ period: "day" });
    const result = analyzeShiftCounterparts(target, [target, tech, dayTech], schedule);
    expect(result.primaryCounterparts).toEqual([tech]);
  });

  it("9. day does not match night", () => {
    const target = supervisorDay();
    const nightTech = technicianDay({ period: "night" });
    const result = analyzeShiftCounterparts(target, [target, nightTech], schedule);
    expect(result.primaryCounterparts).toEqual([]);
  });

  it("10. a different schedule date does not match", () => {
    const target = supervisorDay({ date: "2026-01-05" });
    const otherDateTech = technicianDay({ date: "2026-01-06" });
    const result = analyzeShiftCounterparts(target, [target, otherDateTech], schedule);
    expect(result.primaryCounterparts).toEqual([]);
  });

  it("11. multiple technicians are all returned, not just one", () => {
    const target = supervisorDay();
    const techA = technicianDay({ startTimeOverride: null, endTimeOverride: "12:00" });
    const techB = technicianDay({ startTimeOverride: "12:00", endTimeOverride: null });
    const result = analyzeShiftCounterparts(target, [target, techA, techB], schedule);
    expect(result.primaryCounterparts).toHaveLength(2);
    expect(result.primaryCounterparts).toEqual(expect.arrayContaining([techA, techB]));
  });
});

describe("analyzeShiftCounterparts — coverage math", () => {
  it("12. a single technician spanning the full shift gives full coverage", () => {
    const target = supervisorDay();
    const tech = technicianDay();
    const result = analyzeShiftCounterparts(target, [target, tech], schedule);
    expect(result.coverageStatus).toBe("full");
    expect(result.missingIntervals).toEqual([]);
  });

  it("13. two partial technicians combine into full coverage", () => {
    const target = supervisorDay();
    const techA = technicianDay({ endTimeOverride: "12:00" }); // 07:30-12:00
    const techB = technicianDay({ startTimeOverride: "12:00" }); // 12:00-19:30
    const result = analyzeShiftCounterparts(target, [target, techA, techB], schedule);
    expect(result.coverageStatus).toBe("full");
    expect(result.coveredIntervals).toEqual([{ startMinute: 450, endMinute: 1170 }]);
  });

  it("14. touching intervals (one ends exactly when the next starts) have no gap", () => {
    const merged = mergeIntervals([
      { startMinute: 450, endMinute: 720 },
      { startMinute: 720, endMinute: 1170 },
    ]);
    expect(merged).toEqual([{ startMinute: 450, endMinute: 1170 }]);
  });

  it("15. overlapping counterpart intervals merge correctly", () => {
    const target = supervisorDay();
    const techA = technicianDay({ endTimeOverride: "14:00" }); // 07:30-14:00
    const techB = technicianDay({ startTimeOverride: "12:00" }); // 12:00-19:30 (overlaps techA)
    const result = analyzeShiftCounterparts(target, [target, techA, techB], schedule);
    expect(result.coveredIntervals).toEqual([{ startMinute: 450, endMinute: 1170 }]);
    expect(result.coverageStatus).toBe("full");
  });

  it("16. partial coverage returns the exact missing gap", () => {
    const target = supervisorDay(); // 07:30-19:30
    const techA = technicianDay({ endTimeOverride: "11:00" }); // 07:30-11:00
    const techB = technicianDay({ startTimeOverride: "12:00" }); // 12:00-19:30
    const result = analyzeShiftCounterparts(target, [target, techA, techB], schedule);
    expect(result.coverageStatus).toBe("partial");
    expect(result.missingIntervals).toEqual([{ startMinute: 660, endMinute: 720 }]); // 11:00-12:00
  });

  it("17. no counterpart at all returns missing coverage over the whole target interval", () => {
    const target = supervisorDay();
    const result = analyzeShiftCounterparts(target, [target], schedule);
    expect(result.coverageStatus).toBe("missing");
    expect(result.missingIntervals).toEqual([{ startMinute: 450, endMinute: 1170 }]);
  });

  it("31. coverage intervals are clipped to the target interval, never extending past it", () => {
    const target = technicianDay({ startTimeOverride: "09:00", endTimeOverride: "11:00" }); // 09:00-11:00
    const supervisor = supervisorDay(); // 07:30-19:30, much wider than the target
    const result = analyzeShiftCounterparts(target, [target, supervisor], schedule);
    expect(result.coveredIntervals).toEqual([{ startMinute: 540, endMinute: 660 }]); // clipped to 09:00-11:00
    expect(result.coverageStatus).toBe("full");
  });
});

describe("analyzeShiftCounterparts — shadow shifts", () => {
  it("18. a shadow-only technician does not provide primary coverage", () => {
    const target = supervisorDay();
    const shadowTech = technicianDay({ shadow: true });
    const result = analyzeShiftCounterparts(target, [target, shadowTech], schedule);
    expect(result.primaryCounterparts).toEqual([]);
    expect(result.shadowCounterparts).toEqual([shadowTech]);
    expect(result.coverageStatus).not.toBe("full");
    expect(result.coverageStatus).toBe("missing");
  });

  it("19. a normal technician plus a shadow technician remains full primary coverage", () => {
    const target = supervisorDay();
    const normalTech = technicianDay();
    const shadowTech = technicianDay({ shadow: true });
    const result = analyzeShiftCounterparts(target, [target, normalTech, shadowTech], schedule);
    expect(result.coverageStatus).toBe("full");
    expect(result.primaryCounterparts).toEqual([normalTech]);
  });

  it("20. the shadow Event is still returned separately, never lost", () => {
    const target = supervisorDay();
    const shadowTech = technicianDay({ shadow: true, personName: "נועה דוגמה" });
    const result = analyzeShiftCounterparts(target, [target, shadowTech], schedule);
    expect(result.shadowCounterparts).toHaveLength(1);
    expect(result.shadowCounterparts[0]).toBe(shadowTech);
  });
});

describe("analyzeShiftCounterparts — unspecified period", () => {
  it("21. unspecified supervisor matches unspecified technician", () => {
    const target = supervisorDay({ period: "unspecified" });
    const tech = technicianDay({ period: "unspecified" });
    const result = analyzeShiftCounterparts(target, [target, tech], schedule);
    expect(result.primaryCounterparts).toEqual([tech]);
  });

  it("22. unspecified shifts return not_evaluable timing coverage (but counterparts are still discoverable)", () => {
    const target = supervisorDay({ period: "unspecified" });
    const tech = technicianDay({ period: "unspecified" });
    const result = analyzeShiftCounterparts(target, [target, tech], schedule);
    expect(result.coverageStatus).toBe("not_evaluable");
    expect(result.targetInterval).toBeNull();
    expect(result.coveredIntervals).toEqual([]);
    expect(result.missingIntervals).toEqual([]);
    expect(result.primaryCounterparts).toEqual([tech]);
  });

  it("23. unspecified supervisor does not auto-match a day technician", () => {
    const target = supervisorDay({ period: "unspecified" });
    const dayTech = technicianDay({ period: "day" });
    const result = analyzeShiftCounterparts(target, [target, dayTech], schedule);
    expect(result.primaryCounterparts).toEqual([]);
  });

  it("24. unspecified supervisor does not auto-match a night technician", () => {
    const target = supervisorDay({ period: "unspecified" });
    const nightTech = technicianDay({ period: "night" });
    const result = analyzeShiftCounterparts(target, [target, nightTech], schedule);
    expect(result.primaryCounterparts).toEqual([]);
  });

  it("25. a specific day supervisor does not use an unspecified technician as definite coverage", () => {
    const target = supervisorDay({ period: "day" });
    const unspecifiedTech = technicianDay({ period: "unspecified" });
    const result = analyzeShiftCounterparts(target, [target, unspecifiedTech], schedule);
    expect(result.primaryCounterparts).toEqual([]);
    expect(result.coverageStatus).toBe("missing");
  });
});

describe("analyzeShiftCounterparts — symmetry with a partial target", () => {
  it("26. a partial TARGET shift only requires coverage over its own effective interval", () => {
    const target = technicianDay({ endTimeOverride: "12:00" }); // 07:30-12:00
    const supervisor = supervisorDay(); // full 07:30-19:30
    const result = analyzeShiftCounterparts(target, [target, supervisor], schedule);
    expect(result.targetInterval).toEqual({ startMinute: 450, endMinute: 720 });
    expect(result.coverageStatus).toBe("full");
  });
});

describe("analyzeShiftCounterparts — invalid overrides never fabricate coverage", () => {
  it("28. an invalid 99:99 override on a counterpart does not count as coverage", () => {
    const target = supervisorDay();
    const invalidTech = technicianDay({ startTimeOverride: "99:99" });
    const result = analyzeShiftCounterparts(target, [target, invalidTech], schedule);
    expect(result.primaryCounterparts).toEqual([invalidTech]); // still returned as an Event
    expect(result.coveredIntervals).toEqual([]); // but contributes zero coverage
    expect(result.coverageStatus).toBe("missing");
  });

  it("29. an invalid 25:00 override on the TARGET itself is reported, not silently resolved", () => {
    const target = supervisorDay({ endTimeOverride: "25:00" });
    const tech = technicianDay();
    const result = analyzeShiftCounterparts(target, [target, tech], schedule);
    expect(result.targetIntervalResolution.status).toBe("invalid");
    expect(result.coverageStatus).toBe("not_evaluable");
  });

  it("30. an invalid 12:99 override does not create false full coverage", () => {
    const target = supervisorDay();
    const partiallyInvalidTech = technicianDay({ endTimeOverride: "12:99" });
    const result = analyzeShiftCounterparts(target, [target, partiallyInvalidTech], schedule);
    expect(result.coverageStatus).not.toBe("full");
  });
});

describe("analyzeShiftCounterparts — non-shift events", () => {
  it("32. a non-shift target Event is handled safely, never throwing", () => {
    const dutyTarget: Event = shiftEvent({
      category: "duty",
      role: null,
      period: "unspecified",
      dutyFamily: "guard",
      slot: 1,
    });
    expect(() => analyzeShiftCounterparts(dutyTarget, [dutyTarget], schedule)).not.toThrow();
    const result = analyzeShiftCounterparts(dutyTarget, [dutyTarget], schedule);
    expect(result.coverageStatus).toBe("not_evaluable");
    expect(result.primaryCounterparts).toEqual([]);
  });

  it("a duty/absence/status Event in the events list is never treated as a shift counterpart", () => {
    const target = supervisorDay();
    const dutyEvent = shiftEvent({ category: "duty", role: "technician", dutyFamily: "guard", slot: 1 });
    const absenceEvent = shiftEvent({ category: "absence", role: null });
    const result = analyzeShiftCounterparts(target, [target, dutyEvent, absenceEvent], schedule);
    expect(result.primaryCounterparts).toEqual([]);
  });
});

describe("analyzeShiftCounterparts — immutability and metadata preservation", () => {
  it("33. Event objects passed in are never mutated", () => {
    const target = Object.freeze(supervisorDay());
    const tech = Object.freeze(technicianDay({ endTimeOverride: "12:00" }));
    expect(() => analyzeShiftCounterparts(target, [target, tech], schedule)).not.toThrow();
    expect(tech.endTimeOverride).toBe("12:00");
    expect(target.role).toBe("supervisor");
  });

  it("34. source/certainty metadata on counterpart Events remains untouched (same object references)", () => {
    const target = supervisorDay();
    const tentativeTech = technicianDay({
      certainty: "tentative",
      sourceCell: "F9",
      sourceSheet: "משמרות + תורנויות",
    });
    const result = analyzeShiftCounterparts(target, [target, tentativeTech], schedule);
    expect(result.primaryCounterparts[0]).toBe(tentativeTech);
    expect(result.primaryCounterparts[0].certainty).toBe("tentative");
    expect(result.primaryCounterparts[0].sourceCell).toBe("F9");
  });

  it("35. multiple shift Events for the SAME person are not collapsed and both contribute coverage", () => {
    const target = supervisorDay();
    const sharedPersonId = "p_same_person";
    const firstHalf = technicianDay({ personId: sharedPersonId, endTimeOverride: "12:00", sourceCell: "C2" });
    const secondHalf = technicianDay({ personId: sharedPersonId, startTimeOverride: "12:00", sourceCell: "D2" });
    const result = analyzeShiftCounterparts(target, [target, firstHalf, secondHalf], schedule);
    expect(result.primaryCounterparts).toHaveLength(2);
    expect(result.coverageStatus).toBe("full");
  });
});

describe("interval math helpers", () => {
  it("clipInterval returns null when there is no overlap", () => {
    expect(clipInterval({ startMinute: 0, endMinute: 100 }, { startMinute: 200, endMinute: 300 })).toBeNull();
  });

  it("clipInterval truncates an interval that extends outside the bounds on both sides", () => {
    expect(clipInterval({ startMinute: 0, endMinute: 2000 }, { startMinute: 450, endMinute: 1170 })).toEqual({
      startMinute: 450,
      endMinute: 1170,
    });
  });

  it("mergeIntervals handles an empty list", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("mergeIntervals collapses duplicate/identical intervals", () => {
    expect(
      mergeIntervals([
        { startMinute: 450, endMinute: 1170 },
        { startMinute: 450, endMinute: 1170 },
      ]),
    ).toEqual([{ startMinute: 450, endMinute: 1170 }]);
  });

  it("computeMissingIntervals returns the whole target when nothing is covered", () => {
    expect(computeMissingIntervals({ startMinute: 450, endMinute: 1170 }, [])).toEqual([
      { startMinute: 450, endMinute: 1170 },
    ]);
  });

  it("computeMissingIntervals returns nothing when fully covered", () => {
    expect(
      computeMissingIntervals({ startMinute: 450, endMinute: 1170 }, [{ startMinute: 450, endMinute: 1170 }]),
    ).toEqual([]);
  });
});

describe("analyzeUnitShiftCoverage — unit-wide group coverage (PR #14 hardening)", () => {
  it("A. full technician + full supervisor => full", () => {
    const tech = technicianDay();
    const sup = supervisorDay();
    const result = analyzeUnitShiftCoverage("day", [tech, sup], schedule);
    expect(result.coverageStatus).toBe("full");
    expect(result.missingIntervals).toEqual([]);
  });

  it("B. full technician + supervisor until 12:00 => partial, 12:00-19:30 missing", () => {
    const tech = technicianDay();
    const sup = supervisorDay({ endTimeOverride: "12:00" });
    const result = analyzeUnitShiftCoverage("day", [tech, sup], schedule);
    expect(result.coverageStatus).toBe("partial");
    expect(result.missingIntervals).toEqual([{ startMinute: 720, endMinute: 1170 }]); // 12:00-19:30
  });

  it("C. technician from 12:00 + full supervisor => partial, 07:30-12:00 missing", () => {
    const tech = technicianDay({ startTimeOverride: "12:00" });
    const sup = supervisorDay();
    const result = analyzeUnitShiftCoverage("day", [tech, sup], schedule);
    expect(result.coverageStatus).toBe("partial");
    expect(result.missingIntervals).toEqual([{ startMinute: 450, endMinute: 720 }]); // 07:30-12:00
  });

  it("D. two partial technician Events combine to cover the full shift + full supervisor => full", () => {
    const tech1 = technicianDay({ endTimeOverride: "13:00" });
    const tech2 = technicianDay({ startTimeOverride: "13:00" });
    const sup = supervisorDay();
    const result = analyzeUnitShiftCoverage("day", [tech1, tech2, sup], schedule);
    expect(result.coverageStatus).toBe("full");
    expect(result.missingIntervals).toEqual([]);
  });

  it("E. no supervisor at all => missing, even though technician is fully covered", () => {
    const tech = technicianDay();
    const result = analyzeUnitShiftCoverage("day", [tech], schedule);
    expect(result.coverageStatus).toBe("missing");
    expect(result.missingIntervals).toEqual([{ startMinute: 450, endMinute: 1170 }]);
  });

  it("F. shadow supervisor only => missing (shadow never counts as coverage)", () => {
    const tech = technicianDay();
    const shadowSup = supervisorDay({ shadow: true });
    const result = analyzeUnitShiftCoverage("day", [tech, shadowSup], schedule);
    expect(result.coverageStatus).toBe("missing");
  });

  it("F2. shadow people are excluded from coverage math but this doesn't crash when they're the only events", () => {
    const shadowTech = technicianDay({ shadow: true });
    const shadowSup = supervisorDay({ shadow: true });
    const result = analyzeUnitShiftCoverage("day", [shadowTech, shadowSup], schedule);
    expect(result.coverageStatus).toBe("missing");
    expect(result.missingIntervals).toEqual([{ startMinute: 450, endMinute: 1170 }]);
  });

  it("G. identical status + intervals regardless of person id / input order", () => {
    const tech = technicianDay({ endTimeOverride: "12:00" });
    const sup = supervisorDay();
    const forward = analyzeUnitShiftCoverage("day", [tech, sup], schedule);
    const reversed = analyzeUnitShiftCoverage("day", [sup, tech], schedule);
    expect(forward).toEqual(reversed);
  });

  it("G2. group coverage never depends on which person happens to sort first (regression for the old sortedGroup[0] bug)", () => {
    // Two technicians with different ids/sourceCells; only one has a partial override. The group result must be
    // identical no matter which one a naive "pick sortedGroup[0]" implementation would have chosen as its target.
    const techA = technicianDay({ personId: "p_a", sourceCell: "A1", endTimeOverride: "12:00" });
    const techB = technicianDay({ personId: "p_b", sourceCell: "B1", startTimeOverride: "12:00" });
    const sup = supervisorDay({ personId: "p_c", sourceCell: "C1" });
    const orderA = analyzeUnitShiftCoverage("day", [techA, techB, sup], schedule);
    const orderB = analyzeUnitShiftCoverage("day", [techB, techA, sup], schedule);
    expect(orderA).toEqual(orderB);
    expect(orderA.coverageStatus).toBe("full");
  });

  it("H. night shift partial coverage across midnight (>1440) computed correctly", () => {
    const tech = shiftEvent({ role: "technician", period: "night" }); // full night: 19:30-07:30(+1)
    const sup = shiftEvent({ role: "supervisor", period: "night", endTimeOverride: "01:30" });
    const result = analyzeUnitShiftCoverage("night", [tech, sup], schedule);
    expect(result.coverageStatus).toBe("partial");
    // 19:30=1170, 01:30(+1)=1530, 07:30(+1)=1890
    expect(result.missingIntervals).toEqual([{ startMinute: 1530, endMinute: 1890 }]);
  });

  it("I. an invalid/unresolvable Event never fabricates a full or missing result -- not_evaluable instead", () => {
    const tech = technicianDay({ startTimeOverride: "99:99" }); // invalid override -> unresolvable
    const sup = supervisorDay();
    const result = analyzeUnitShiftCoverage("day", [tech, sup], schedule);
    expect(result.coverageStatus).toBe("not_evaluable");
    expect(result.missingIntervals).toEqual([]);
  });

  it("I2. an unresolved duplicate Event does NOT invalidate an already-provably-full result", () => {
    const techResolved = technicianDay();
    const techInvalid = technicianDay({ startTimeOverride: "99:99" });
    const sup = supervisorDay();
    const result = analyzeUnitShiftCoverage("day", [techResolved, techInvalid, sup], schedule);
    expect(result.coverageStatus).toBe("full");
    expect(result.missingIntervals).toEqual([]);
  });

  it("a period with no canonical window (morning/unspecified) is always not_evaluable", () => {
    const tech = technicianDay({ period: "morning" });
    const result = analyzeUnitShiftCoverage("morning", [tech], schedule);
    expect(result.coverageStatus).toBe("not_evaluable");
  });

  it("an empty group (no events at all) is missing, not a crash", () => {
    const result = analyzeUnitShiftCoverage("day", [], schedule);
    expect(result.coverageStatus).toBe("missing");
  });
});
