import { describe, expect, it } from "vitest";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { EmergencyAssignment } from "@/lib/domain/emergencyShift";
import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";
import { buildEmergencyPersonalHome } from "./buildEmergencyPersonalHome";

const PERIOD: EmergencyModePeriod = {
  id: "period1",
  activatedAt: "2026-08-26T14:00:00.000Z",
  activatedByUserId: "u1",
  activatedByPersonId: "p_mgr",
  activatedByPersonName: "מנהל בדיקה",
  startDate: "2026-08-26",
  deactivatedAt: null,
  deactivatedByUserId: null,
  deactivatedByPersonId: null,
  deactivatedByPersonName: null,
  endDate: null,
};

const SCHEDULE = buildShiftSchedule("08:00"); // day 08:00-20:00, night 20:00-08:00(+1)

function assignment(overrides: Partial<EmergencyAssignment> = {}): EmergencyAssignment {
  return {
    date: "2026-08-26",
    period: "day",
    desk: "הוגוורט",
    personId: "p_self",
    personName: "מרטין בדיקה",
    sourceCell: "C2",
    ...overrides,
  };
}

describe("buildEmergencyPersonalHome — current shift", () => {
  it("finds the person's own current shift when now falls inside it", () => {
    const result = buildEmergencyPersonalHome({
      period: PERIOD,
      assignments: [assignment()],
      personId: "p_self",
      now: { date: "2026-08-26", minuteOfDay: 10 * 60 }, // 10:00, inside day shift
      schedule: SCHEDULE,
      fetchedAt: "2026-08-26T14:00:00.000Z",
      diagnostics: [],
    });

    expect(result.current).not.toBeNull();
    expect(result.current?.ownDesks).toEqual(["הוגוורט"]);
  });

  it("current is null when the person has no assignment in the currently active period, even if others do", () => {
    const result = buildEmergencyPersonalHome({
      period: PERIOD,
      assignments: [assignment({ personId: "p_other", personName: "אחר" })],
      personId: "p_self",
      now: { date: "2026-08-26", minuteOfDay: 10 * 60 },
      schedule: SCHEDULE,
      fetchedAt: "2026-08-26T14:00:00.000Z",
      diagnostics: [],
    });

    expect(result.current).toBeNull();
  });

  it("current is null (never guessed) when the regular shift-time configuration is unavailable", () => {
    const result = buildEmergencyPersonalHome({
      period: PERIOD,
      assignments: [assignment()],
      personId: "p_self",
      now: { date: "2026-08-26", minuteOfDay: 10 * 60 },
      schedule: null,
      fetchedAt: "2026-08-26T14:00:00.000Z",
      diagnostics: [],
    });

    expect(result.current).toBeNull();
    expect(result.current?.startMinute ?? null).toBeNull();
  });
});

describe("buildEmergencyPersonalHome — multiple own desks", () => {
  it("never silently drops a second desk assignment for the same shift", () => {
    const result = buildEmergencyPersonalHome({
      period: PERIOD,
      assignments: [
        assignment({ desk: "הוגוורט", sourceCell: "C2" }),
        assignment({ desk: "תיעוד", sourceCell: "J2" }),
      ],
      personId: "p_self",
      now: { date: "2026-08-26", minuteOfDay: 10 * 60 },
      schedule: SCHEDULE,
      fetchedAt: "2026-08-26T14:00:00.000Z",
      diagnostics: [],
    });

    expect(result.current?.ownDesks).toEqual(["הוגוורט", "תיעוד"]);
  });
});

describe("buildEmergencyPersonalHome — roster ('מי איתי')", () => {
  it("lists every OTHER assignment on the same date+period, excluding self", () => {
    const result = buildEmergencyPersonalHome({
      period: PERIOD,
      assignments: [
        assignment({ personId: "p_self", desk: "הוגוורט" }),
        assignment({ personId: "p_2", personName: "ליה", desk: "תיעוד", sourceCell: "J2" }),
        assignment({ personId: "p_3", personName: "נדב", desk: "ק'", sourceCell: "E2" }),
      ],
      personId: "p_self",
      now: { date: "2026-08-26", minuteOfDay: 10 * 60 },
      schedule: SCHEDULE,
      fetchedAt: "2026-08-26T14:00:00.000Z",
      diagnostics: [],
    });

    expect(result.current?.roster).toHaveLength(2);
    expect(result.current?.roster.map((r) => r.personName)).toEqual(["ליה", "נדב"]);
    expect(result.current?.roster.some((r) => r.personName === "מרטין בדיקה")).toBe(false);
  });

  it("includes an UNRESOLVED colleague (personId null) in the roster rather than dropping them", () => {
    const result = buildEmergencyPersonalHome({
      period: PERIOD,
      assignments: [
        assignment({ personId: "p_self", desk: "הוגוורט" }),
        assignment({ personId: null, personName: "מישהו לא ידוע", desk: "תיעוד", sourceCell: "J2" }),
      ],
      personId: "p_self",
      now: { date: "2026-08-26", minuteOfDay: 10 * 60 },
      schedule: SCHEDULE,
      fetchedAt: "2026-08-26T14:00:00.000Z",
      diagnostics: [],
    });

    expect(result.current?.roster).toHaveLength(1);
    expect(result.current?.roster[0].personName).toBe("מישהו לא ידוע");
    expect(result.current?.roster[0].personId).toBeNull();
  });
});

describe("buildEmergencyPersonalHome — next shift", () => {
  it("finds the next own shift chronologically after the current period", () => {
    const result = buildEmergencyPersonalHome({
      period: PERIOD,
      assignments: [
        assignment({ date: "2026-08-26", period: "day" }),
        assignment({ date: "2026-08-27", period: "day" }),
      ],
      personId: "p_self",
      now: { date: "2026-08-26", minuteOfDay: 10 * 60 }, // inside today's day shift
      schedule: SCHEDULE,
      fetchedAt: "2026-08-26T14:00:00.000Z",
      diagnostics: [],
    });

    expect(result.next?.date).toBe("2026-08-27");
  });

  it("without a schedule, still honestly finds the chronologically next own assignment by date", () => {
    const result = buildEmergencyPersonalHome({
      period: PERIOD,
      assignments: [assignment({ date: "2026-08-28", period: "night" })],
      personId: "p_self",
      now: { date: "2026-08-26", minuteOfDay: 10 * 60 },
      schedule: null,
      fetchedAt: "2026-08-26T14:00:00.000Z",
      diagnostics: [],
    });

    expect(result.next?.date).toBe("2026-08-28");
    expect(result.next?.startMinute).toBeNull();
  });

  it("is null when the person has no future assignment at all", () => {
    const result = buildEmergencyPersonalHome({
      period: PERIOD,
      assignments: [],
      personId: "p_self",
      now: { date: "2026-08-26", minuteOfDay: 10 * 60 },
      schedule: SCHEDULE,
      fetchedAt: "2026-08-26T14:00:00.000Z",
      diagnostics: [],
    });

    expect(result.next).toBeNull();
  });
});

describe("buildEmergencyPersonalHome — diagnostics passthrough", () => {
  it("passes parser diagnostics through untouched", () => {
    const result = buildEmergencyPersonalHome({
      period: PERIOD,
      assignments: [],
      personId: "p_self",
      now: { date: "2026-08-26", minuteOfDay: 10 * 60 },
      schedule: SCHEDULE,
      fetchedAt: "2026-08-26T14:00:00.000Z",
      diagnostics: [{ sourceCell: "M5", message: "בעיה בשורה" }],
    });

    expect(result.diagnostics).toEqual([{ sourceCell: "M5", message: "בעיה בשורה" }]);
  });
});
