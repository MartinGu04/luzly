import { describe, expect, it } from "vitest";
import type { EmergencyAssignment } from "@/lib/domain/emergencyShift";
import type { LocalNow } from "@/lib/domain/localNow";
import { buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { resolveEmergencyManagerOverview } from "./buildEmergencyManagerOverview";

// Day starts 07:00 -> day [420,1140), night [1140,1860) (i.e. wraps to 06:00 the next calendar day).
const SCHEDULE: ShiftSchedule = buildShiftSchedule("07:00");

function assignment(overrides: Partial<EmergencyAssignment> = {}): EmergencyAssignment {
  return {
    date: "2026-08-27",
    period: "day",
    desk: "הוגוורט",
    personId: "p1",
    personName: "מרטין",
    sourceCell: "C2",
    ...overrides,
  };
}

describe("resolveEmergencyManagerOverview -- correct previous/current/next resolution", () => {
  it("resolves current to the shift whose interval contains `now`, previous/next as the immediately adjacent slots", () => {
    const assignments: EmergencyAssignment[] = [
      assignment({ date: "2026-08-26", period: "night", desk: "הוגוורט", personId: "pA", personName: "א" }),
      assignment({ date: "2026-08-27", period: "day", desk: "הוגוורט", personId: "pB", personName: "ב" }),
      assignment({ date: "2026-08-27", period: "night", desk: "הוגוורט", personId: "pC", personName: "ג" }),
    ];
    const now: LocalNow = { date: "2026-08-27", minuteOfDay: 600 }; // 10:00, inside the day window

    const overview = resolveEmergencyManagerOverview(assignments, now, SCHEDULE);

    expect(overview.current).toMatchObject({ date: "2026-08-27", period: "day" });
    expect(overview.previous).toMatchObject({ date: "2026-08-26", period: "night" });
    expect(overview.next).toMatchObject({ date: "2026-08-27", period: "night" });
  });

  it("current's desk grid reflects the SAME person the assignment recorded, never a placeholder", () => {
    const assignments: EmergencyAssignment[] = [assignment({ date: "2026-08-27", period: "day", desk: "פ'", personId: "pB", personName: "ב" })];
    const now: LocalNow = { date: "2026-08-27", minuteOfDay: 600 };

    const overview = resolveEmergencyManagerOverview(assignments, now, SCHEDULE);

    const deskSlot = overview.current?.desks.find((d) => d.desk === "פ'");
    expect(deskSlot).toEqual({ desk: "פ'", personId: "pB", personName: "ב" });
  });
});

describe("resolveEmergencyManagerOverview -- day -> night -> next-day day boundaries", () => {
  const assignments: EmergencyAssignment[] = [
    assignment({ date: "2026-08-27", period: "day" }),
    assignment({ date: "2026-08-27", period: "night" }),
    assignment({ date: "2026-08-28", period: "day" }),
  ];

  it("exactly at day start (07:00) -- current is the day shift", () => {
    const overview = resolveEmergencyManagerOverview(assignments, { date: "2026-08-27", minuteOfDay: 420 }, SCHEDULE);
    expect(overview.current).toMatchObject({ date: "2026-08-27", period: "day" });
  });

  it("exactly at the day -> night boundary (19:00) -- current flips to the night shift, previous becomes the day shift", () => {
    const overview = resolveEmergencyManagerOverview(assignments, { date: "2026-08-27", minuteOfDay: 1140 }, SCHEDULE);
    expect(overview.current).toMatchObject({ date: "2026-08-27", period: "night" });
    expect(overview.previous).toMatchObject({ date: "2026-08-27", period: "day" });
    expect(overview.next).toMatchObject({ date: "2026-08-28", period: "day" });
  });

  it("just before the day -> night boundary (18:59) -- current is still the day shift", () => {
    const overview = resolveEmergencyManagerOverview(assignments, { date: "2026-08-27", minuteOfDay: 1139 }, SCHEDULE);
    expect(overview.current).toMatchObject({ date: "2026-08-27", period: "day" });
  });

  it("night shift still running past midnight (02:00 the next calendar day) -- current stays the PREVIOUS calendar date's night shift, next is that date's own day shift", () => {
    const overview = resolveEmergencyManagerOverview(assignments, { date: "2026-08-28", minuteOfDay: 120 }, SCHEDULE);
    expect(overview.current).toMatchObject({ date: "2026-08-27", period: "night" });
    expect(overview.previous).toMatchObject({ date: "2026-08-27", period: "day" });
    expect(overview.next).toMatchObject({ date: "2026-08-28", period: "day" });
  });
});

describe("resolveEmergencyManagerOverview -- no active shift at the exact current time", () => {
  it("current is null when nothing was recorded for the exact resolved date+period, while previous/next still populate from real data", () => {
    const assignments: EmergencyAssignment[] = [
      assignment({ date: "2026-08-26", period: "night" }), // previous
      assignment({ date: "2026-08-27", period: "night" }), // next
      // Deliberately nothing at 2026-08-27/day -- the exact "now" slot.
    ];
    const now: LocalNow = { date: "2026-08-27", minuteOfDay: 600 };

    const overview = resolveEmergencyManagerOverview(assignments, now, SCHEDULE);

    expect(overview.current).toBeNull();
    expect(overview.previous).toMatchObject({ date: "2026-08-26", period: "night" });
    expect(overview.next).toMatchObject({ date: "2026-08-27", period: "night" });
  });

  it("all three are null when the workbook has no assignments at all -- never a crash, never a fabricated shift", () => {
    const overview = resolveEmergencyManagerOverview([], { date: "2026-08-27", minuteOfDay: 600 }, SCHEDULE);
    expect(overview).toEqual({ previous: null, current: null, next: null });
  });
});

describe("resolveEmergencyManagerOverview -- degraded (schedule unavailable)", () => {
  it("current and previous are both null when the regular shift-time configuration is broken -- never guessed", () => {
    const assignments: EmergencyAssignment[] = [assignment({ date: "2026-08-27", period: "day" })];
    const overview = resolveEmergencyManagerOverview(assignments, { date: "2026-08-27", minuteOfDay: 600 }, null);

    expect(overview.current).toBeNull();
    expect(overview.previous).toBeNull();
  });

  it("next still falls back to the earliest recorded shift from today, since that needs no time-of-day precision", () => {
    const assignments: EmergencyAssignment[] = [
      assignment({ date: "2026-08-20", period: "day" }), // in the past -- excluded
      assignment({ date: "2026-08-28", period: "night" }), // earliest at/after today
      assignment({ date: "2026-08-29", period: "day" }),
    ];
    const overview = resolveEmergencyManagerOverview(assignments, { date: "2026-08-27", minuteOfDay: 600 }, null);

    expect(overview.next).toMatchObject({ date: "2026-08-28", period: "night" });
  });
});

describe("resolveEmergencyManagerOverview -- all desks and unresolved people are shown (reuses toEveryoneShiftEntry)", () => {
  it("current's desk grid always includes all ten canonical desks, unstaffed ones included", () => {
    const assignments: EmergencyAssignment[] = [assignment({ date: "2026-08-27", period: "day", desk: "הוגוורט" })];
    const overview = resolveEmergencyManagerOverview(assignments, { date: "2026-08-27", minuteOfDay: 600 }, SCHEDULE);

    expect(overview.current?.desks).toHaveLength(10);
    expect(overview.current?.desks.filter((d) => d.personName === null)).toHaveLength(9);
  });

  it("an unresolved assignment (personId null) keeps its raw personName in the desk grid, never dropped", () => {
    const assignments: EmergencyAssignment[] = [
      assignment({ date: "2026-08-27", period: "day", desk: "תיעוד", personId: null, personName: "שם לא מזוהה" }),
    ];
    const overview = resolveEmergencyManagerOverview(assignments, { date: "2026-08-27", minuteOfDay: 600 }, SCHEDULE);

    const deskSlot = overview.current?.desks.find((d) => d.desk === "תיעוד");
    expect(deskSlot).toEqual({ desk: "תיעוד", personId: null, personName: "שם לא מזוהה" });
  });
});
