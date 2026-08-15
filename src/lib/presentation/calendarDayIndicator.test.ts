import { describe, expect, it } from "vitest";
import type { PersonalEventView } from "@/lib/readModels/types";
import type { HolidayContext } from "./hebrewCalendar";
import { buildDayIndicators, eventIndicator, holidayIndicator } from "./calendarDayIndicator";

function baseEvent(overrides: Partial<PersonalEventView> = {}): PersonalEventView {
  return {
    date: "2026-08-16",
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

function holiday(overrides: Partial<HolidayContext> = {}): HolidayContext {
  return { emoji: "🍎", label: "ראש השנה", kind: "holiday", shortLabel: "חג", ...overrides };
}

describe("eventIndicator", () => {
  it("labels a day shift 'יום', never the full assignment title", () => {
    const indicator = eventIndicator(baseEvent({ category: "shift", period: "day" }), "k");
    expect(indicator.label).toBe("יום");
    expect(indicator.emoji).toBe("☀️");
  });

  it("labels a night shift 'לילה'", () => {
    const indicator = eventIndicator(baseEvent({ category: "shift", period: "night" }), "k");
    expect(indicator.label).toBe("לילה");
    expect(indicator.emoji).toBe("🌙");
  });

  it("falls back to the generic 'משמרת' label when the period has no short word", () => {
    const indicator = eventIndicator(baseEvent({ category: "shift", period: "unspecified" }), "k");
    expect(indicator.label).toBe("משמרת");
  });

  it("labels any duty generically as 'תורנות', never the specific duty family", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "guard", slot: 1, title: "שומר 1" }),
      "k",
    );
    expect(indicator.label).toBe("תורנות");
  });

  it("labels an absence with its own kind label", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "absence", role: null, period: "unspecified", absenceKind: "vacation", title: "חופש" }),
      "k",
    );
    expect(indicator.label).toBe("חופש");
    expect(indicator.emoji).toBe("🏖️");
  });

  it("labels an 'after' absence distinctly from vacation", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "absence", role: null, period: "unspecified", absenceKind: "after", title: "אפטר" }),
      "k",
    );
    expect(indicator.label).toBe("אפטר");
  });

  it("marks a tentative event as tentative", () => {
    const indicator = eventIndicator(baseEvent({ certainty: "tentative" }), "k");
    expect(indicator.tentative).toBe(true);
  });

  it("marks a confirmed event as not tentative", () => {
    const indicator = eventIndicator(baseEvent({ certainty: "confirmed" }), "k");
    expect(indicator.tentative).toBe(false);
  });
});

describe("holidayIndicator", () => {
  it("uses the holiday's generic shortLabel, never the specific holiday name", () => {
    const indicator = holidayIndicator(holiday({ label: "חול המועד סוכות", shortLabel: "חוה״מ", kind: "cholHamoed" }));
    expect(indicator.label).toBe("חוה״מ");
    expect(indicator.label).not.toContain("סוכות");
  });

  it("carries the holiday's own emoji through unchanged", () => {
    const indicator = holidayIndicator(holiday({ emoji: "🌿" }));
    expect(indicator.emoji).toBe("🌿");
  });
});

describe("buildDayIndicators", () => {
  it("returns an empty list for an ordinary day with no events", () => {
    expect(buildDayIndicators([], null)).toEqual([]);
  });

  it("puts the holiday indicator first, ahead of the day's own events", () => {
    const indicators = buildDayIndicators([baseEvent()], holiday());
    expect(indicators[0].label).toBe("חג");
    expect(indicators[1].label).toBe("יום");
  });

  it("never truncates -- returns every indicator, leaving slicing to the caller", () => {
    const events = [baseEvent({ period: "day" }), baseEvent({ period: "night" }), baseEvent({ category: "duty" })];
    const indicators = buildDayIndicators(events, holiday());
    expect(indicators).toHaveLength(4);
  });

  it("omits the holiday indicator entirely when there is no holiday", () => {
    const indicators = buildDayIndicators([baseEvent()], null);
    expect(indicators.some((indicator) => indicator.key === "holiday")).toBe(false);
  });
});
