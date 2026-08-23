import { describe, expect, it } from "vitest";
import type { LocalNow } from "@/lib/domain/localNow";
import type { PersonalEventView } from "@/lib/readModels/types";
import { buildPersonalWeekOverview } from "./personalWeekOverview";

function localNow(date: string, minuteOfDay = 600): LocalNow {
  return { date, minuteOfDay };
}

function baseEvent(overrides: Partial<PersonalEventView> = {}): PersonalEventView {
  return {
    date: "2026-08-19",
    title: "טכנאי יום",
    rawValue: "טכנאי יום",
    category: "shift",
    certainty: "confirmed",
    role: "technician",
    period: "day",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    dutyFamily: null,
    absenceKind: null,
    changeNote: null,
    timing: { status: "not_evaluable" },
    ...overrides,
  };
}

const RESOLVED_TIMING = {
  status: "resolved" as const,
  startLocalTime: "07:30",
  endLocalTime: "19:30",
  durationMinutes: 720,
  elapsedMinutesAtLoad: 0,
  remainingMinutesAtLoad: 720,
  progressPercentAtLoad: 0,
  minutesUntilStartAtLoad: 0,
};

describe("buildPersonalWeekOverview", () => {
  it("returns exactly seven dates, Sunday -> Saturday, ascending", () => {
    const overview = buildPersonalWeekOverview([], localNow("2026-08-19"));
    expect(overview.weekStart).toBe("2026-08-16");
    expect(overview.weekEnd).toBe("2026-08-22");
    expect(overview.days.map((day) => day.date)).toEqual([
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
  });

  it("rolls a week correctly across a month boundary", () => {
    // 2026-08-31 is a Monday.
    const overview = buildPersonalWeekOverview([], localNow("2026-08-31"));
    expect(overview.weekStart).toBe("2026-08-30");
    expect(overview.weekEnd).toBe("2026-09-05");
    expect(overview.days).toHaveLength(7);
  });

  it("rolls a week correctly across a year boundary", () => {
    // 2026-12-31 is a Thursday.
    const overview = buildPersonalWeekOverview([], localNow("2026-12-31"));
    expect(overview.weekStart).toBe("2026-12-27");
    expect(overview.weekEnd).toBe("2027-01-02");
    expect(overview.days).toHaveLength(7);
  });

  it("never includes an event dated outside the exact week", () => {
    const before = baseEvent({ date: "2026-08-15", title: "לפני השבוע" }); // Saturday, previous week
    const after = baseEvent({ date: "2026-08-23", title: "אחרי השבוע" }); // next week's Sunday
    const inside = baseEvent({ date: "2026-08-18", title: "בתוך השבוע" });

    const overview = buildPersonalWeekOverview([before, after, inside], localNow("2026-08-19"));

    const titles = overview.days.flatMap((day) => day.events.map((event) => event.title));
    expect(titles).toEqual(["בתוך השבוע"]);
  });

  it("includes earlier-this-week events -- proving this never used upcomingEvents", () => {
    const earlierThisWeek = baseEvent({ date: "2026-08-16", title: "משמרת שכבר עברה" });

    const overview = buildPersonalWeekOverview([earlierThisWeek], localNow("2026-08-19"));

    const sunday = overview.days.find((day) => day.date === "2026-08-16");
    expect(sunday?.events.map((event) => event.title)).toEqual(["משמרת שכבר עברה"]);
  });

  it("marks exactly the correct day as today", () => {
    const overview = buildPersonalWeekOverview([], localNow("2026-08-19"));
    const todays = overview.days.filter((day) => day.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].date).toBe("2026-08-19");
  });

  it("still renders a day with no events at all", () => {
    const overview = buildPersonalWeekOverview([], localNow("2026-08-19"));
    const monday = overview.days.find((day) => day.date === "2026-08-17");
    expect(monday).toBeDefined();
    expect(monday?.events).toEqual([]);
  });

  it("renders multiple events on the same date, all of them", () => {
    const dayShift = baseEvent({ date: "2026-08-17", title: "טכנאי יום" });
    const duty = baseEvent({
      date: "2026-08-17",
      category: "duty",
      role: null,
      period: "unspecified",
      dutyFamily: "guard",
      slot: 1,
      title: "שומר 1",
      rawValue: "שומר 1",
    });

    const overview = buildPersonalWeekOverview([dayShift, duty], localNow("2026-08-19"));
    const monday = overview.days.find((day) => day.date === "2026-08-17");
    expect(monday?.events.map((event) => event.title)).toEqual(["טכנאי יום", "שומר 1"]);
  });

  it("preserves the calendarEvents' own deterministic within-day ordering (never re-sorted)", () => {
    // calendarEvents arrives already ordered by the read model; a later
    // event listed first in the input must stay first in the output.
    const night = baseEvent({ date: "2026-08-17", period: "night", title: "טכנאי לילה" });
    const day = baseEvent({ date: "2026-08-17", period: "day", title: "טכנאי יום" });

    const overview = buildPersonalWeekOverview([night, day], localNow("2026-08-19"));
    const monday = overview.days.find((day) => day.date === "2026-08-17");
    expect(monday?.events.map((event) => event.title)).toEqual(["טכנאי לילה", "טכנאי יום"]);
  });

  it("shows a resolved shift's real start/end time", () => {
    const shift = baseEvent({ date: "2026-08-19", timing: RESOLVED_TIMING });
    const overview = buildPersonalWeekOverview([shift], localNow("2026-08-19"));
    const today = overview.days.find((day) => day.isToday);
    expect(today?.events[0].timing).toEqual(RESOLVED_TIMING);
  });

  it("never invents a time for a shift whose timing is not resolved", () => {
    const shift = baseEvent({ date: "2026-08-19", timing: { status: "not_evaluable" } });
    const overview = buildPersonalWeekOverview([shift], localNow("2026-08-19"));
    const today = overview.days.find((day) => day.isToday);
    expect(today?.events[0].timing).toEqual({ status: "not_evaluable" });
  });

  it("shows the specific duty family's own label and emoji, not a generic 'תורנות'", () => {
    const duty = baseEvent({
      date: "2026-08-19",
      category: "duty",
      role: null,
      period: "unspecified",
      dutyFamily: "guard",
      slot: 2,
      title: "שומר 2",
      rawValue: "שומר 2",
    });

    const overview = buildPersonalWeekOverview([duty], localNow("2026-08-19"));
    const today = overview.days.find((day) => day.isToday);
    expect(today?.events[0].emoji).toBe("💂");
    expect(today?.events[0].subtitle).toBe("שמירה 2");
  });

  it("shows an absence on its correct day with the existing absence-kind label", () => {
    const vacation = baseEvent({
      date: "2026-08-18",
      category: "absence",
      role: null,
      period: "unspecified",
      absenceKind: "vacation",
      title: "משהו אחר",
      rawValue: "חופש",
    });

    const overview = buildPersonalWeekOverview([vacation], localNow("2026-08-19"));
    const tuesday = overview.days.find((day) => day.date === "2026-08-18");
    expect(tuesday?.events[0].emoji).toBe("🏖️");
    expect(tuesday?.events[0].subtitle).toBe("חופש");
  });

  it("elides a subtitle identical to the title rather than repeating it", () => {
    const vacation = baseEvent({
      date: "2026-08-18",
      category: "absence",
      role: null,
      period: "unspecified",
      absenceKind: "vacation",
      title: "חופש",
      rawValue: "חופש",
    });

    const overview = buildPersonalWeekOverview([vacation], localNow("2026-08-19"));
    const tuesday = overview.days.find((day) => day.date === "2026-08-18");
    expect(tuesday?.events[0].subtitle).toBeNull();
  });

  it("preserves tentative ('משוער') semantics from the event's own certainty", () => {
    const tentativeShift = baseEvent({ date: "2026-08-19", certainty: "tentative" });
    const confirmedShift = baseEvent({ date: "2026-08-20", certainty: "confirmed" });

    const overview = buildPersonalWeekOverview([tentativeShift, confirmedShift], localNow("2026-08-19"));
    expect(overview.days.find((day) => day.date === "2026-08-19")?.events[0].tentative).toBe(true);
    expect(overview.days.find((day) => day.date === "2026-08-20")?.events[0].tentative).toBe(false);
  });

  it("only ever consumes the personal calendarEvents/localNow it was given -- no colleague/raw source data enters the view", () => {
    const event = baseEvent({ date: "2026-08-19" });
    const overview = buildPersonalWeekOverview([event], localNow("2026-08-19"));

    const day = overview.days.find((d) => d.isToday);
    const keys = Object.keys(day?.events[0] ?? {});
    expect(keys).toEqual(["key", "title", "emoji", "subtitle", "category", "timing", "tentative"]);
  });
});
