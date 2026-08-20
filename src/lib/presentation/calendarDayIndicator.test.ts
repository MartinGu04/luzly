import { describe, expect, it } from "vitest";
import type { PersonalEventView } from "@/lib/readModels/types";
import { buildDayIndicators, eventIndicator } from "./calendarDayIndicator";

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

  it("labels a duty with its own duty-family label, never the generic 'תורנות'", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "guard", slot: 1, title: "שומר 1" }),
      "k",
    );
    expect(indicator.label).toBe("שמירה");
  });

  it("labels a full_kitchen duty 'מטבח מלא'", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "full_kitchen" }),
      "k",
    );
    expect(indicator.label).toBe("מטבח מלא");
  });

  it("labels a daily_kitchen duty 'מטבח יומי'", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "daily_kitchen" }),
      "k",
    );
    expect(indicator.label).toBe("מטבח יומי");
  });

  it("labels a rasar duty 'רס\"ר', with its own emoji", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "rasar" }),
      "k",
    );
    expect(indicator.label).toBe('רס"ר');
    expect(indicator.emoji).toBe("🧹");
  });

  it("labels an oxid duty 'אוקסיד', with its own emoji", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "oxid" }),
      "k",
    );
    expect(indicator.label).toBe("אוקסיד");
    expect(indicator.emoji).toBe("📄");
  });

  it("falls back to the generic 'תורנות' label for a duty Event with no dutyFamily at all", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: null }),
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

  it("carries the semantic color class for a day shift", () => {
    const indicator = eventIndicator(baseEvent({ category: "shift", period: "day" }), "k");
    expect(indicator.colorClassName).toBe("bg-event-shift-day-soft");
  });

  it("carries a distinct semantic color class for a night shift", () => {
    const indicator = eventIndicator(baseEvent({ category: "shift", period: "night" }), "k");
    expect(indicator.colorClassName).toBe("bg-event-shift-night-soft");
  });

  it("carries the semantic color class for a mapped absence kind", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "absence", role: null, period: "unspecified", absenceKind: "referral" }),
      "k",
    );
    expect(indicator.colorClassName).toBe("bg-event-referral-soft");
  });

  it("colorClassName is null for an unmapped duty family (rasar) -- degrades safely, no guessed color", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "rasar" }),
      "k",
    );
    expect(indicator.colorClassName).toBeNull();
  });

  it("carries the shared reserve color class for a reserve duty", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "reserve" }),
      "k",
    );
    expect(indicator.colorClassName).toBe("bg-event-reserve-soft");
  });

  it("carries the SAME shared reserve color class for a callup duty as for reserve", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "duty", role: null, period: "unspecified", dutyFamily: "callup" }),
      "k",
    );
    expect(indicator.colorClassName).toBe("bg-event-reserve-soft");
  });

  it("carries the shared medical-rest color class for a medical absence", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "absence", role: null, period: "unspecified", absenceKind: "medical" }),
      "k",
    );
    expect(indicator.colorClassName).toBe("bg-event-medical-rest-soft");
  });

  it("carries the SAME shared medical-rest color class for a day_off absence as for medical", () => {
    const indicator = eventIndicator(
      baseEvent({ category: "absence", role: null, period: "unspecified", absenceKind: "day_off" }),
      "k",
    );
    expect(indicator.colorClassName).toBe("bg-event-medical-rest-soft");
  });

  it("carries the shift-morning color class for a morning shift", () => {
    const indicator = eventIndicator(baseEvent({ category: "shift", period: "morning" }), "k");
    expect(indicator.colorClassName).toBe("bg-event-shift-morning-soft");
  });

  describe("personal activities (status/other -- display-only informational entries)", () => {
    it("labels a 'סוגר' status activity with its own original title and lock emoji", () => {
      const indicator = eventIndicator(
        baseEvent({ category: "status", period: "unspecified", title: "סוגר", rawValue: "סוגר" }),
        "k",
      );
      expect(indicator.label).toBe("סוגר");
      expect(indicator.emoji).toBe("🔒");
    });

    it("labels a 'שלב 9' other activity with its own title and graduation-cap emoji", () => {
      const indicator = eventIndicator(
        baseEvent({ category: "other", period: "unspecified", title: "שלב 9", rawValue: "שלב 9" }),
        "k",
      );
      expect(indicator.label).toBe("שלב 9");
      expect(indicator.emoji).toBe("🎓");
    });

    it("labels a 'שלב 11' other activity with the same graduation-cap emoji as שלב 9", () => {
      const indicator = eventIndicator(
        baseEvent({ category: "other", period: "unspecified", title: "שלב 11", rawValue: "שלב 11" }),
        "k",
      );
      expect(indicator.label).toBe("שלב 11");
      expect(indicator.emoji).toBe("🎓");
    });

    it("labels a 'כנס בטיחות' other activity with its own title and safety-vest emoji", () => {
      const indicator = eventIndicator(
        baseEvent({ category: "other", period: "unspecified", title: "כנס בטיחות", rawValue: "כנס בטיחות" }),
        "k",
      );
      expect(indicator.label).toBe("כנס בטיחות");
      expect(indicator.emoji).toBe("🦺");
    });

    it("labels a 'כנס יוהל\"ם' other activity with its own title and the generic pin emoji", () => {
      const indicator = eventIndicator(
        baseEvent({ category: "other", period: "unspecified", title: 'כנס יוהל"ם', rawValue: 'כנס יוהל"ם' }),
        "k",
      );
      expect(indicator.label).toBe('כנס יוהל"ם');
      expect(indicator.emoji).toBe("📌");
    });

    it("an unrecognized non-empty activity keeps its ORIGINAL title, with the generic pin fallback emoji -- never disappears", () => {
      const indicator = eventIndicator(
        baseEvent({ category: "other", period: "unspecified", title: "פעילות חדשה שלא ראינו", rawValue: "פעילות חדשה שלא ראינו" }),
        "k",
      );
      expect(indicator.label).toBe("פעילות חדשה שלא ראינו");
      expect(indicator.emoji).toBe("📌");
    });
  });
});

describe("buildDayIndicators", () => {
  it("returns an empty list for an ordinary day with no events", () => {
    expect(buildDayIndicators([])).toEqual([]);
  });

  it("never truncates -- returns every indicator, leaving slicing to the caller", () => {
    const events = [baseEvent({ period: "day" }), baseEvent({ period: "night" }), baseEvent({ category: "duty" })];
    const indicators = buildDayIndicators(events);
    expect(indicators).toHaveLength(3);
  });

  it("never builds a holiday indicator -- holiday is calendar context, rendered separately by the caller", () => {
    const indicators = buildDayIndicators([baseEvent()]);
    expect(indicators.some((indicator) => indicator.key === "holiday")).toBe(false);
  });
});
