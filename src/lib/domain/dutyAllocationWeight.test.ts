import { describe, expect, it } from "vitest";
import {
  computeCompletedDutyAllocation,
  DUTY_ALLOCATION_WEIGHT_BY_FAMILY,
  resolveGuardReserveBlockShape,
} from "./dutyAllocationWeight";
import type { DutyFamily, Event } from "./event";

function dutyEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p1",
    personName: "מרטין בדיקה",
    date: "2026-01-05",
    title: "שומר 1",
    rawValue: "שומר 1",
    category: "duty",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "sheet",
    sourceCell: "A1",
    slot: 1,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: "guard",
    absenceKind: null,
    ...overrides,
  };
}

/** One event per date, same family/slot/person -- the common "a block spans these dates" test shape. */
function block(dutyFamily: DutyFamily, dates: readonly string[], overrides: Partial<Event> = {}): Event[] {
  return dates.map((date) => dutyEvent({ dutyFamily, date, ...overrides }));
}

// Real Jan 2026 weekdays (verified via the Gregorian calendar): Jan 1 = Thursday.
// Thu 1, Fri 2, Sat 3, Sun 4, Mon 5, Tue 6, Wed 7, Thu 8, Fri 9, Sat 10, Sun 11, Mon 12, Tue 13.
const WEEKEND_BLOCK_DATES = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]; // Thu-Sun
const HALF_WEEK_BLOCK_DATES = ["2026-01-05", "2026-01-06", "2026-01-07"]; // Mon-Wed
// weekend_kitchen's OWN established "complete weekend" span (dutyBlocks.ts's computeWeekendCompleteness) is Thu-Fri-Sat -- 3 days, NOT the same 4-day Thu-Sun span guard/reserve uses.
const WEEKEND_KITCHEN_COMPLETE_DATES = ["2026-01-01", "2026-01-02", "2026-01-03"]; // Thu-Fri-Sat
const H1_START = "2026-01-01";
const H1_END = "2026-06-30";

describe("resolveGuardReserveBlockShape — the three confirmed business-rule shapes only", () => {
  it("exactly 1 day -> single_day, regardless of weekday", () => {
    expect(resolveGuardReserveBlockShape(1, "2026-01-06")).toBe("single_day"); // a Tuesday
    expect(resolveGuardReserveBlockShape(1, "2026-01-01")).toBe("single_day"); // a Thursday
  });

  it("exactly 3 days starting Monday -> half_week", () => {
    expect(resolveGuardReserveBlockShape(3, "2026-01-05")).toBe("half_week");
  });

  it("3 days NOT starting Monday -> unsupported (null), never guessed as half_week", () => {
    expect(resolveGuardReserveBlockShape(3, "2026-01-06")).toBeNull(); // starts Tuesday
  });

  it("exactly 4 days starting Thursday -> weekend", () => {
    expect(resolveGuardReserveBlockShape(4, "2026-01-01")).toBe("weekend");
  });

  it("4 days NOT starting Thursday -> unsupported (null), never guessed as weekend", () => {
    expect(resolveGuardReserveBlockShape(4, "2026-01-05")).toBeNull(); // starts Monday
  });

  it.each([2, 5, 6])("%s days -> unsupported (null), no shape matches", (dayCount) => {
    expect(resolveGuardReserveBlockShape(dayCount, "2026-01-01")).toBeNull();
  });
});

describe("DUTY_ALLOCATION_WEIGHT_BY_FAMILY — the one canonical weight table", () => {
  it("carries every non-guard/reserve family's business-rule weight (rasar per day, every other family per allocation block)", () => {
    expect(DUTY_ALLOCATION_WEIGHT_BY_FAMILY).toEqual({
      rasar: 0.2,
      daily_kitchen: 0.2,
      full_kitchen: 0.5,
      weekend_kitchen: 1,
      oxid: 0,
      evacuation_on_call: 0,
      callup: 0,
    });
  });
});

describe("computeCompletedDutyAllocation — guard/reserve block shapes (never numberOfDays × rate)", () => {
  it("single-day guard = 0.25", () => {
    const events = block("guard", ["2026-01-06"]);
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0.25);
  });

  it("half-week guard (Mon-Wed) = 0.5, never 3 x a per-day rate", () => {
    const events = block("guard", HALF_WEEK_BLOCK_DATES);
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0.5);
  });

  it("weekend guard (Thu-Sun) = 1, never 4 x a per-day rate", () => {
    const events = block("guard", WEEKEND_BLOCK_DATES);
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(1);
  });

  it("reserve follows the EXACT same shape rules as guard", () => {
    expect(computeCompletedDutyAllocation(block("reserve", ["2026-01-06"]), "p1", H1_START, H1_END).total).toBe(0.25);
    expect(computeCompletedDutyAllocation(block("reserve", HALF_WEEK_BLOCK_DATES), "p1", H1_START, H1_END).total).toBe(0.5);
    expect(computeCompletedDutyAllocation(block("reserve", WEEKEND_BLOCK_DATES), "p1", H1_START, H1_END).total).toBe(1);
  });

  it("a guard block still forming its shape from tentative days never contributes -- not yet a settled fact", () => {
    const events = block("guard", WEEKEND_BLOCK_DATES, { certainty: "tentative" });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0);
  });

  it("a mixed confirmed/tentative block never contributes either -- the whole block isn't settled yet", () => {
    const events = [
      ...block("guard", ["2026-01-01", "2026-01-02"]),
      ...block("guard", ["2026-01-03", "2026-01-04"], { certainty: "tentative" }),
    ];
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0);
  });
});

describe("computeCompletedDutyAllocation — CRITICAL: classifies from the FULL block shape, never a range-truncated slice", () => {
  it("a Thu-Sun weekend block only half completed as of the cutoff contributes 0, NOT a partial 1-2 day allocation", () => {
    const events = block("guard", WEEKEND_BLOCK_DATES); // Thu 1 - Sun 4
    // Cutoff lands mid-block (Friday) -- the block's true shape is still the full 4-day weekend.
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, "2026-01-02");
    expect(result.total).toBe(0);
    expect(result.unsupportedBlocks).toEqual([]); // a real, valid weekend shape -- just not yet fully completed, not an error
  });

  it("the SAME weekend block contributes its full 1.0 once the cutoff reaches its last day", () => {
    const events = block("guard", WEEKEND_BLOCK_DATES);
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, "2026-01-04").total).toBe(1);
  });

  it("a block straddling the period-start boundary never contributes, even though it has a real, classifiable shape and part of it is in range", () => {
    const events = block("guard", HALF_WEEK_BLOCK_DATES); // real half_week shape: Mon 01-05 - Wed 01-07
    // The requested range only starts Tuesday 01-06 -- the block itself
    // started a day earlier, so it is NOT fully contained in the range.
    const result = computeCompletedDutyAllocation(events, "p1", "2026-01-06", H1_END);
    expect(result.total).toBe(0);
    expect(result.unsupportedBlocks).toEqual([]); // a real, valid shape -- simply not fully inside the range, not an error
  });
});

describe("computeCompletedDutyAllocation — unsupported guard/reserve block shapes are reported, never guessed", () => {
  it("a real 2-day guard block -> total null, with identifying diagnostic info preserved", () => {
    const events = block("guard", ["2026-01-06", "2026-01-07"], { slot: 3 });
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, H1_END);
    expect(result.total).toBeNull();
    expect(result.unsupportedBlocks).toEqual([
      { dutyFamily: "guard", slot: 3, startDate: "2026-01-06", endDate: "2026-01-07", dayCount: 2 },
    ]);
  });

  it("a real 5-day guard block -> total null", () => {
    const events = block("guard", ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"]);
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, H1_END);
    expect(result.total).toBeNull();
    expect(result.unsupportedBlocks).toHaveLength(1);
  });

  it("a 4-day block that does NOT start Thursday -> total null, never silently treated as a weekend", () => {
    const events = block("guard", ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]); // Mon-Thu
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, H1_END);
    expect(result.total).toBeNull();
    expect(result.unsupportedBlocks[0]).toMatchObject({ dutyFamily: "guard", dayCount: 4, startDate: "2026-01-05" });
  });

  it("an unsupported block that hasn't happened yet (outside the effective range) does NOT poison the total", () => {
    const events = block("guard", ["2026-08-01", "2026-08-02"]); // 2-day shape, but entirely beyond the H1 cutoff
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, H1_END);
    expect(result.total).toBe(0);
    expect(result.unsupportedBlocks).toEqual([]);
  });

  it("a tentative-only unsupported-shape block never poisons the total either -- it isn't a REAL settled block yet", () => {
    const events = block("guard", ["2026-01-06", "2026-01-07"], { certainty: "tentative" });
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, H1_END);
    expect(result.total).toBe(0);
    expect(result.unsupportedBlocks).toEqual([]);
  });

  it("an unresolved block wipes out the WHOLE total, even when other real allocations exist", () => {
    const events = [
      ...block("guard", WEEKEND_BLOCK_DATES), // a real, valid 1.0
      ...block("reserve", ["2026-01-12", "2026-01-13"]), // unsupported 2-day reserve block
    ];
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, H1_END);
    expect(result.total).toBeNull();
    expect(result.unsupportedBlocks).toHaveLength(1);
    expect(result.unsupportedBlocks[0].dutyFamily).toBe("reserve");
  });
});

describe("computeCompletedDutyAllocation — flat per-allocation families (full_kitchen/oxid/evacuation_on_call/callup): ONE block = ONE contribution, never numberOfDays × rate", () => {
  it("full_kitchen (single day) = 0.5", () => {
    const events = block("full_kitchen", ["2026-01-06"], { slot: null });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0.5);
  });

  it("REGRESSION: a multi-day full_kitchen allocation still contributes exactly 0.5 ONCE, never dayCount x 0.5", () => {
    const events = block("full_kitchen", ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"], { slot: null }); // one 4-day block
    expect(events).toHaveLength(4);
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0.5);
  });

  it("oxid = 0 -- a real, confirmed duty that simply contributes nothing", () => {
    const events = block("oxid", ["2026-01-06"], { slot: null });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0);
  });

  it("evacuation_on_call = 0", () => {
    const events = block("evacuation_on_call", ["2026-01-06"], { slot: null });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0);
  });

  it("callup (הקפצה) = 0", () => {
    const events = block("callup", ["2026-01-06"], { slot: null });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0);
  });

  it("an in-progress (not yet fully completed) full_kitchen block contributes 0 for now, no partial credit", () => {
    const events = block("full_kitchen", ["2026-01-05", "2026-01-06", "2026-01-07"], { slot: null }); // Mon-Wed
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, "2026-01-06"); // cutoff mid-block
    expect(result.total).toBe(0);
  });
});

describe("computeCompletedDutyAllocation — weekend_kitchen: ONE fixed 1.0 for the whole completed weekend allocation, never per day", () => {
  it("a complete 3-day Thu-Fri-Sat weekend_kitchen block = 1.0, never dayCount x 1.0", () => {
    const events = block("weekend_kitchen", WEEKEND_KITCHEN_COMPLETE_DATES, { slot: null });
    expect(events).toHaveLength(3);
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(1);
  });

  it("REGRESSION: the SAME 3-day block never contributes 3 x 1.0 = 3", () => {
    const events = block("weekend_kitchen", WEEKEND_KITCHEN_COMPLETE_DATES, { slot: null });
    const total = computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total;
    expect(total).not.toBe(3);
    expect(total).toBe(1);
  });

  it("an incomplete weekend_kitchen run (e.g. only 2 of the 3 days) contributes 0 -- not yet the established complete weekend shape", () => {
    const events = block("weekend_kitchen", ["2026-01-01", "2026-01-02"], { slot: null }); // Thu-Fri only
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0);
  });

  it("a misaligned 3-day run (not starting Thursday) contributes 0 -- never silently treated as complete", () => {
    const events = block("weekend_kitchen", ["2026-01-05", "2026-01-06", "2026-01-07"], { slot: null }); // Mon-Wed
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0);
  });

  it("a weekend_kitchen block still in progress as of the cutoff contributes 0 for now, same as guard/reserve's own boundary rule", () => {
    const events = block("weekend_kitchen", WEEKEND_KITCHEN_COMPLETE_DATES, { slot: null });
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, "2026-01-02"); // cutoff mid-block (Friday)
    expect(result.total).toBe(0);
  });

  it("the SAME weekend_kitchen block contributes its full 1.0 once the cutoff reaches its last day", () => {
    const events = block("weekend_kitchen", WEEKEND_KITCHEN_COMPLETE_DATES, { slot: null });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, "2026-01-03").total).toBe(1);
  });
});

describe("computeCompletedDutyAllocation — rasar: the ONLY day-based family, 0.2 per actual completed day", () => {
  it("rasar = 0.2 PER ACTUAL COMPLETED DAY -- never assuming one multi-day event group = 0.2 flat", () => {
    const events = block("rasar", ["2026-01-05", "2026-01-06", "2026-01-07"], { slot: null });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBeCloseTo(0.6);
  });

  it("rasar events crossing the cutoff boundary: only the in-range days contribute", () => {
    const events = block("rasar", ["2026-01-03", "2026-01-04", "2026-01-05"], { slot: null });
    // Cutoff at 01-04 -- only two of the three days are actually completed/in-range.
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, "2026-01-04");
    expect(result.total).toBeCloseTo(0.4);
  });

  it("rasar events crossing the PERIOD START boundary: only the in-range days contribute", () => {
    const events = block("rasar", ["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"], { slot: null });
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, H1_END);
    expect(result.total).toBeCloseTo(0.4); // only 01-01 and 01-02 are inside H1
  });
});

describe("computeCompletedDutyAllocation — daily_kitchen: day-based (0.2 per actual completed day), NOT a per-allocation block", () => {
  it("daily_kitchen (single day) = 0.2", () => {
    const events = block("daily_kitchen", ["2026-01-06"], { slot: null });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0.2);
  });

  it("REGRESSION (root-cause fix): TWO separate calendar-adjacent daily_kitchen days contribute 0.2 EACH (0.4 total), never merged into one 0.2 block", () => {
    const events = block("daily_kitchen", ["2026-01-05", "2026-01-06"], { slot: null }); // two real, consecutive days
    expect(events).toHaveLength(2);
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBeCloseTo(0.4);
  });

  it("REGRESSION (root-cause fix): a 3-day daily_kitchen stretch is 3 x 0.2 = 0.6, never a flat 0.2 lump", () => {
    const events = block("daily_kitchen", ["2026-01-05", "2026-01-06", "2026-01-07"], { slot: null });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBeCloseTo(0.6);
  });

  it("REGRESSION (root-cause fix): an already-COMPLETED daily_kitchen day is never zeroed out by a calendar-adjacent FUTURE daily_kitchen day for the same person", () => {
    const events = block("daily_kitchen", ["2026-08-14", "2026-08-15", "2026-08-16"], { slot: null }); // 08-14/08-15 already happened, 08-16 is still scheduled/future
    // Cutoff (today) is 2026-08-15 -- under the OLD block-based bug, this
    // 3-day run's endDate (08-16) would extend past the cutoff, failing
    // the "fully within range" block check and zeroing ALL three days,
    // including the two that genuinely already happened.
    const result = computeCompletedDutyAllocation(events, "p1", "2026-07-01", "2026-08-15");
    expect(result.total).toBeCloseTo(0.4); // 08-14 and 08-15 count; 08-16 (future) does not
  });

  it("rasar events crossing the cutoff boundary: only the in-range days contribute (same day-based rule as rasar)", () => {
    const events = block("daily_kitchen", ["2026-01-03", "2026-01-04", "2026-01-05"], { slot: null });
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, "2026-01-04");
    expect(result.total).toBeCloseTo(0.4);
  });

  it("respects the selected period -- a daily_kitchen duty outside [periodStartDate, effectiveEndDate] is excluded even if it already happened", () => {
    const events = [
      ...block("daily_kitchen", ["2026-03-01"], { slot: null }), // inside H1
      ...block("daily_kitchen", ["2025-12-20"], { slot: null }), // before H1 -- a prior period
    ];
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBeCloseTo(0.2);
  });

  it("a tentative daily_kitchen day is a plan, not yet settled -- never counted", () => {
    const events = block("daily_kitchen", ["2026-03-01"], { slot: null, certainty: "tentative" });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0);
  });
});

describe("computeCompletedDutyAllocation — regression case reproducing the real production report (fixture data, never the real person)", () => {
  it("a person who recently performed a daily_kitchen duty AND a single-day reserve/standby duty gets BOTH reflected, summed correctly", () => {
    // Modeled on a real triage report: a person's recently-performed daily
    // kitchen duty and reserve/standby duty were not correctly reflected in
    // their fairness score. Reproduced here with synthetic fixture data,
    // never the real person's name/id.
    const events: Event[] = [
      ...block("daily_kitchen", ["2026-08-12"], { slot: null, personId: "p_fixture" }), // 0.2, a single completed kitchen day
      ...block("reserve", ["2026-08-13"], { personId: "p_fixture" }), // 0.25, a single completed reserve day
    ];
    const result = computeCompletedDutyAllocation(events, "p_fixture", "2026-07-01", "2026-08-15");
    expect(result.total).toBeCloseTo(0.45);
    expect(result.unsupportedBlocks).toEqual([]);
  });

  it("the SAME person's daily_kitchen duty still counts even when immediately followed by a future daily_kitchen day (the confirmed root cause)", () => {
    const events: Event[] = [
      ...block("daily_kitchen", ["2026-08-14", "2026-08-15"], { slot: null, personId: "p_fixture" }), // completed
      ...block("daily_kitchen", ["2026-08-16"], { slot: null, personId: "p_fixture" }), // future, calendar-adjacent
      ...block("reserve", ["2026-08-10"], { personId: "p_fixture" }), // an unrelated, already-completed single-day reserve duty
    ];
    const result = computeCompletedDutyAllocation(events, "p_fixture", "2026-07-01", "2026-08-15");
    // 0.2 + 0.2 (two completed kitchen days) + 0.25 (reserve) = 0.65 -- the
    // future 08-16 day contributes nothing yet, and critically does NOT
    // zero out the two days that already happened.
    expect(result.total).toBeCloseTo(0.65);
  });
});

describe("computeCompletedDutyAllocation — a multi-duty person: score is the SUM of several different duty types", () => {
  it("guard (weekend) + reserve (single day) + full_kitchen + rasar (2 days) + daily_kitchen (2 days) all sum correctly", () => {
    const events: Event[] = [
      ...block("guard", WEEKEND_BLOCK_DATES), // Thu-Sun -> 1.0
      ...block("reserve", ["2026-02-16"]), // single day -> 0.25 (2026-02-16 is a Monday, irrelevant for single_day)
      ...block("full_kitchen", ["2026-03-01"], { slot: null }), // 0.5
      ...block("rasar", ["2026-03-10", "2026-03-11"], { slot: null }), // 0.2 x 2 = 0.4
      ...block("daily_kitchen", ["2026-04-01", "2026-04-02"], { slot: null }), // 0.2 x 2 = 0.4
    ];
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, H1_END);
    // 1.0 + 0.25 + 0.5 + 0.4 + 0.4 = 2.55
    expect(result.total).toBeCloseTo(2.55);
  });
});

describe("computeCompletedDutyAllocation — mixed real duties, period/cutoff filtering, and raw-count divergence", () => {
  it("mixed duty types sum correctly: 1 + 1 + 0.5 + 0.2 + 0.2 = 2.9, never a fabricated round number", () => {
    const events: Event[] = [
      ...block("guard", WEEKEND_BLOCK_DATES), // Thu-Sun -> 1.0
      ...block("reserve", ["2026-02-05", "2026-02-06", "2026-02-07", "2026-02-08"]), // Thu-Sun -> 1.0
      ...block("full_kitchen", ["2026-03-01"], { slot: null }), // 0.5
      ...block("rasar", ["2026-03-02"], { slot: null }), // 0.2
      ...block("daily_kitchen", ["2026-03-03"], { slot: null }), // 0.2
    ];
    const result = computeCompletedDutyAllocation(events, "p1", H1_START, H1_END);
    expect(result.total).toBeCloseTo(2.9);
  });

  it("raw event count can differ significantly from the allocation total -- a 4-day weekend guard block is 4 events but ONE 1.0 allocation", () => {
    const events = block("guard", WEEKEND_BLOCK_DATES);
    expect(events).toHaveLength(4);
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(1);
  });

  it("respects the selected period -- a duty outside [periodStartDate, effectiveEndDate] is excluded even if it already happened", () => {
    const events = [
      ...block("rasar", ["2026-03-01"], { slot: null }), // inside H1
      ...block("rasar", ["2025-12-20"], { slot: null }), // before H1 -- a prior period
    ];
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBeCloseTo(0.2);
  });

  it("today-cutoff: a duty dated after the effective end date contributes nothing yet", () => {
    const events = [
      ...block("rasar", ["2026-08-14"], { slot: null }), // completed as of the cutoff
      ...block("rasar", ["2026-08-16"], { slot: null }), // tomorrow relative to the cutoff -- not yet
    ];
    const result = computeCompletedDutyAllocation(events, "p1", "2026-07-01", "2026-08-15");
    expect(result.total).toBeCloseTo(0.2);
  });

  it("future events contribute nothing, even far in the future within the same period", () => {
    const events = block("rasar", ["2026-12-31"], { slot: null });
    const result = computeCompletedDutyAllocation(events, "p1", "2026-07-01", "2026-08-15");
    expect(result.total).toBe(0);
  });

  it("only counts the requested person's own events", () => {
    const events = [
      ...block("rasar", ["2026-03-01"], { slot: null, personId: "p1" }),
      ...block("rasar", ["2026-03-01"], { slot: null, personId: "p2" }),
    ];
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBeCloseTo(0.2);
  });

  it("a tentative day-based duty is a plan, not yet settled -- never counted", () => {
    const events = block("rasar", ["2026-03-01"], { slot: null, certainty: "tentative" });
    expect(computeCompletedDutyAllocation(events, "p1", H1_START, H1_END).total).toBe(0);
  });

  it("no matching events -> 0, never a crash, never null", () => {
    const result = computeCompletedDutyAllocation([], "p1", H1_START, H1_END);
    expect(result.total).toBe(0);
    expect(result.unsupportedBlocks).toEqual([]);
  });
});
