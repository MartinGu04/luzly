import { describe, expect, it } from "vitest";
import type { EmergencyPersonalShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";
import { buildEmergencyPersonalAgenda } from "./emergencyAgenda";

function shift(overrides: Partial<EmergencyPersonalShiftEntry> = {}): EmergencyPersonalShiftEntry {
  return { date: "2026-08-26", period: "day", ownDesks: ["הוגוורט"], roster: [], ...overrides };
}

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
