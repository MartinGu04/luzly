import { describe, expect, it } from "vitest";
import type { LocalNow } from "@/lib/domain/localNow";
import type { EmergencyPersonalShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";
import {
  DEFAULT_EMERGENCY_SCHEDULE_RANGE,
  buildEmergencyPersonalAgenda,
  buildEmergencyScheduleAgendaView,
  parseEmergencyScheduleRangeParam,
  resolveEmergencyScheduleRangeDates,
} from "./emergencyAgenda";

function shift(overrides: Partial<EmergencyPersonalShiftEntry> = {}): EmergencyPersonalShiftEntry {
  return { date: "2026-08-26", period: "day", ownDesks: ["הוגוורט"], roster: [], ...overrides };
}

const TODAY: LocalNow = { date: "2026-08-26", minuteOfDay: 600 };

describe("buildEmergencyPersonalAgenda -- chronological upcoming ordering", () => {
  it("orders upcoming date-groups chronologically ascending regardless of input order", () => {
    const agenda = buildEmergencyPersonalAgenda(
      [shift({ date: "2026-09-05" }), shift({ date: "2026-08-27" }), shift({ date: "2026-08-30" })],
      "2026-08-26",
    );

    expect(agenda.upcoming.map((g) => g.date)).toEqual(["2026-08-27", "2026-08-30", "2026-09-05"]);
  });

  it("within one date, orders day before night regardless of input order", () => {
    const agenda = buildEmergencyPersonalAgenda(
      [shift({ date: "2026-08-27", period: "night" }), shift({ date: "2026-08-27", period: "day" })],
      "2026-08-26",
    );

    expect(agenda.upcoming[0].shifts.map((s) => s.period)).toEqual(["day", "night"]);
  });

  it("today's own date counts as upcoming, not past", () => {
    const agenda = buildEmergencyPersonalAgenda([shift({ date: "2026-08-26" })], "2026-08-26");

    expect(agenda.upcoming.map((g) => g.date)).toEqual(["2026-08-26"]);
    expect(agenda.past).toEqual([]);
  });
});

describe("buildEmergencyPersonalAgenda -- old history never becomes the default/upcoming focus", () => {
  it("a date strictly before today lands in `past`, never `upcoming` -- e.g. an old February row while today is August", () => {
    const agenda = buildEmergencyPersonalAgenda(
      [shift({ date: "2026-02-10" }), shift({ date: "2026-08-27" })],
      "2026-08-26",
    );

    expect(agenda.upcoming.map((g) => g.date)).toEqual(["2026-08-27"]);
    expect(agenda.past.map((g) => g.date)).toEqual(["2026-02-10"]);
  });

  it("history is never dropped -- every past date-group is still present in `past`, just separated from `upcoming`", () => {
    const agenda = buildEmergencyPersonalAgenda(
      [shift({ date: "2026-02-10" }), shift({ date: "2026-03-01" }), shift({ date: "2026-08-27" })],
      "2026-08-26",
    );

    expect(agenda.past).toHaveLength(2);
    expect(agenda.upcoming).toHaveLength(1);
  });

  it("an emergency period entirely in the past resolves to an empty `upcoming`, never a fabricated one", () => {
    const agenda = buildEmergencyPersonalAgenda([shift({ date: "2026-02-10" })], "2026-08-26");

    expect(agenda.upcoming).toEqual([]);
    expect(agenda.past.map((g) => g.date)).toEqual(["2026-02-10"]);
  });
});

describe("buildEmergencyPersonalAgenda -- grouping multiple desks in the same date+period", () => {
  it("a single (date,period) entry with multiple ownDesks stays together as ONE shift entry inside ONE date-group -- never split apart", () => {
    const agenda = buildEmergencyPersonalAgenda(
      [shift({ date: "2026-08-27", period: "day", ownDesks: ["הוגוורט", "תיעוד", "ק'"] })],
      "2026-08-26",
    );

    expect(agenda.upcoming).toHaveLength(1);
    expect(agenda.upcoming[0].shifts).toHaveLength(1);
    expect(agenda.upcoming[0].shifts[0].ownDesks).toEqual(["הוגוורט", "תיעוד", "ק'"]);
  });

  it("day and night on the same date stay as two DISTINCT shift entries within the same date-group, never merged into one", () => {
    const agenda = buildEmergencyPersonalAgenda(
      [
        shift({ date: "2026-08-27", period: "day", ownDesks: ["הוגוורט"] }),
        shift({ date: "2026-08-27", period: "night", ownDesks: ["ק'"] }),
      ],
      "2026-08-26",
    );

    expect(agenda.upcoming).toHaveLength(1);
    expect(agenda.upcoming[0].shifts).toHaveLength(2);
  });
});

describe("buildEmergencyPersonalAgenda -- filters out date+periods the viewed person has no desk in", () => {
  it("drops a shift entry with an empty ownDesks -- a recorded date+period where someone else was staffed, not this person", () => {
    const agenda = buildEmergencyPersonalAgenda(
      [
        shift({ date: "2026-08-27", ownDesks: [], roster: [{ personId: "p2", personName: "אחר", desk: "ק'" }] }),
        shift({ date: "2026-08-28", ownDesks: ["הוגוורט"] }),
      ],
      "2026-08-26",
    );

    expect(agenda.upcoming.map((g) => g.date)).toEqual(["2026-08-28"]);
  });

  it("also filters an empty-ownDesks entry out of `past`, not just `upcoming`", () => {
    const agenda = buildEmergencyPersonalAgenda([shift({ date: "2026-02-10", ownDesks: [] })], "2026-08-26");

    expect(agenda.past).toEqual([]);
    expect(agenda.upcoming).toEqual([]);
  });
});

describe("buildEmergencyPersonalAgenda -- empty input", () => {
  it("returns empty upcoming and past for no shifts at all", () => {
    const agenda = buildEmergencyPersonalAgenda([], "2026-08-26");
    expect(agenda).toEqual({ upcoming: [], past: [] });
  });
});

describe("parseEmergencyScheduleRangeParam -- strict allowlist, default is 7 ימים", () => {
  it("defaults to '7d' when the param is missing/null/undefined", () => {
    expect(parseEmergencyScheduleRangeParam(null)).toBe("7d");
    expect(parseEmergencyScheduleRangeParam(undefined)).toBe("7d");
    expect(DEFAULT_EMERGENCY_SCHEDULE_RANGE).toBe("7d");
  });

  it("defaults to '7d' for any unrecognized value -- e.g. the regular Manager range's own 'month' key, never a crash", () => {
    expect(parseEmergencyScheduleRangeParam("month")).toBe("7d");
    expect(parseEmergencyScheduleRangeParam("bogus")).toBe("7d");
    expect(parseEmergencyScheduleRangeParam("")).toBe("7d");
  });

  it("accepts each of the four valid keys verbatim", () => {
    expect(parseEmergencyScheduleRangeParam("today")).toBe("today");
    expect(parseEmergencyScheduleRangeParam("tomorrow")).toBe("tomorrow");
    expect(parseEmergencyScheduleRangeParam("7d")).toBe("7d");
    expect(parseEmergencyScheduleRangeParam("30d")).toBe("30d");
  });
});

describe("resolveEmergencyScheduleRangeDates", () => {
  it("'today' resolves to exactly one date -- today itself", () => {
    expect(resolveEmergencyScheduleRangeDates("today", TODAY)).toEqual(["2026-08-26"]);
  });

  it("'tomorrow' resolves to exactly one date -- the civil day after today, never today itself", () => {
    expect(resolveEmergencyScheduleRangeDates("tomorrow", TODAY)).toEqual(["2026-08-27"]);
  });

  it("'7d' resolves to today plus the next 6 civil days (7 dates total), correctly rolling a month boundary", () => {
    const dates = resolveEmergencyScheduleRangeDates("7d", { date: "2026-08-28", minuteOfDay: 0 });
    expect(dates).toEqual([
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("'30d' resolves to today plus the next 29 civil days (30 dates total)", () => {
    const dates = resolveEmergencyScheduleRangeDates("30d", TODAY);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2026-08-26");
    expect(dates[29]).toBe("2026-09-24");
  });

  it("'tomorrow' correctly rolls a year boundary", () => {
    expect(resolveEmergencyScheduleRangeDates("tomorrow", { date: "2026-12-31", minuteOfDay: 0 })).toEqual(["2027-01-01"]);
  });
});

describe("buildEmergencyScheduleAgendaView -- default selection is 7 ימים", () => {
  it("filters `current` down to a 7-day window when no range is explicitly requested (the caller's own default)", () => {
    const view = buildEmergencyScheduleAgendaView(
      [shift({ date: "2026-08-26" }), shift({ date: "2026-09-10" })],
      DEFAULT_EMERGENCY_SCHEDULE_RANGE,
      TODAY,
    );

    expect(view.range).toBe("7d");
    expect(view.current.map((g) => g.date)).toEqual(["2026-08-26"]);
  });
});

describe("buildEmergencyScheduleAgendaView -- today filtering", () => {
  it("shows only today's own date-group, excluding a shift on any other date", () => {
    const view = buildEmergencyScheduleAgendaView(
      [shift({ date: "2026-08-26" }), shift({ date: "2026-08-27" })],
      "today",
      TODAY,
    );

    expect(view.current.map((g) => g.date)).toEqual(["2026-08-26"]);
  });

  it("resolves to an empty `current` (never a fabricated entry) when there is no shift today", () => {
    const view = buildEmergencyScheduleAgendaView([shift({ date: "2026-08-27" })], "today", TODAY);
    expect(view.current).toEqual([]);
  });
});

describe("buildEmergencyScheduleAgendaView -- tomorrow filtering", () => {
  it("shows only tomorrow's own date-group, excluding today and later dates", () => {
    const view = buildEmergencyScheduleAgendaView(
      [shift({ date: "2026-08-26" }), shift({ date: "2026-08-27" }), shift({ date: "2026-08-28" })],
      "tomorrow",
      TODAY,
    );

    expect(view.current.map((g) => g.date)).toEqual(["2026-08-27"]);
  });
});

describe("buildEmergencyScheduleAgendaView -- 7-day filtering", () => {
  it("includes today through day+6, excludes day+7 and beyond", () => {
    const view = buildEmergencyScheduleAgendaView(
      [
        shift({ date: "2026-08-26" }), // day 0 -- in range
        shift({ date: "2026-09-01" }), // day 6 -- in range (last day)
        shift({ date: "2026-09-02" }), // day 7 -- out of range
      ],
      "7d",
      TODAY,
    );

    expect(view.current.map((g) => g.date)).toEqual(["2026-08-26", "2026-09-01"]);
  });
});

describe("buildEmergencyScheduleAgendaView -- 30-day filtering", () => {
  it("includes today through day+29, excludes day+30 and beyond", () => {
    const view = buildEmergencyScheduleAgendaView(
      [
        shift({ date: "2026-08-26" }), // day 0
        shift({ date: "2026-09-24" }), // day 29 -- last in-range day
        shift({ date: "2026-09-25" }), // day 30 -- out of range
      ],
      "30d",
      TODAY,
    );

    expect(view.current.map((g) => g.date)).toEqual(["2026-08-26", "2026-09-24"]);
  });
});

describe("buildEmergencyScheduleAgendaView -- history is independent of the range selector", () => {
  it("`past` always reflects the FULL history regardless of the selected range -- 'today' still surfaces all past dates", () => {
    const view = buildEmergencyScheduleAgendaView(
      [shift({ date: "2026-02-10" }), shift({ date: "2026-08-20" }), shift({ date: "2026-08-26" })],
      "today",
      TODAY,
    );

    expect(view.past.map((g) => g.date)).toEqual(["2026-02-10", "2026-08-20"]);
  });
});
