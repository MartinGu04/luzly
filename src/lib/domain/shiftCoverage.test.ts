import { describe, expect, it } from "vitest";
import type { Event } from "./event";
import { buildShiftSchedule } from "./shiftSchedule";
import {
  analyzeShiftCounterparts,
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
