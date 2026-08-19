import { describe, expect, it } from "vitest";
import type { AbsenceKind, DutyFamily } from "@/lib/domain/event";
import { eventColorBgClassName, eventColorKey, type EventColorInput } from "./eventColor";

function baseInput(overrides: Partial<EventColorInput> = {}): EventColorInput {
  return { category: "shift", period: "day", dutyFamily: null, absenceKind: null, ...overrides };
}

describe("eventColorKey", () => {
  it("maps a day shift to shift-day", () => {
    expect(eventColorKey(baseInput({ category: "shift", period: "day" }))).toBe("shift-day");
  });

  it("maps a night shift to shift-night, distinct from day", () => {
    expect(eventColorKey(baseInput({ category: "shift", period: "night" }))).toBe("shift-night");
  });

  it("maps a morning shift to its own shift-morning slot, distinct from day and night", () => {
    expect(eventColorKey(baseInput({ category: "shift", period: "morning" }))).toBe("shift-morning");
  });

  it("a shift with period 'unspecified' has no dedicated slot", () => {
    expect(eventColorKey(baseInput({ category: "shift", period: "unspecified" }))).toBeNull();
  });

  const dutyCases: Array<[DutyFamily, string | null]> = [
    ["guard", "guard"],
    ["evacuation_on_call", "evacuation"],
    ["full_kitchen", "kitchen"],
    ["daily_kitchen", "kitchen"],
    ["weekend_kitchen", "kitchen"],
    ["reserve", "reserve"],
    ["callup", "reserve"],
    ["rasar", null],
    ["oxid", null],
  ];
  it.each(dutyCases)("duty family %s -> %s", (dutyFamily, expected) => {
    expect(eventColorKey(baseInput({ category: "duty", period: "unspecified", dutyFamily }))).toBe(expected);
  });

  const absenceCases: Array<[AbsenceKind, string | null]> = [
    ["vacation", "vacation"],
    ["abroad", "vacation"],
    ["after", "after"],
    ["referral", "referral"],
    ["medical", "medical-rest"],
    ["day_off", "medical-rest"],
  ];
  it.each(absenceCases)("absence kind %s -> %s", (absenceKind, expected) => {
    expect(eventColorKey(baseInput({ category: "absence", period: "unspecified", absenceKind }))).toBe(expected);
  });

  it("a category with no relevant typed field (constraint/status/context/change_note/other/unknown) is always null", () => {
    for (const category of ["constraint", "status", "context", "change_note", "other", "unknown"] as const) {
      expect(eventColorKey(baseInput({ category, period: "unspecified" }))).toBeNull();
    }
  });

  it("a duty event with dutyFamily: null (never happens for a real duty, but must degrade safely) is null", () => {
    expect(eventColorKey(baseInput({ category: "duty", period: "unspecified", dutyFamily: null }))).toBeNull();
  });

  it("an absence event with absenceKind: null degrades safely to null", () => {
    expect(eventColorKey(baseInput({ category: "absence", period: "unspecified", absenceKind: null }))).toBeNull();
  });

  it("reserve and callup share the exact same 'reserve' slot -- one shared military/reserve color, not two", () => {
    const reserve = eventColorKey(baseInput({ category: "duty", period: "unspecified", dutyFamily: "reserve" }));
    const callup = eventColorKey(baseInput({ category: "duty", period: "unspecified", dutyFamily: "callup" }));
    expect(reserve).toBe(callup);
    expect(reserve).toBe("reserve");
  });

  it("medical and day_off share the exact same 'medical-rest' slot -- one shared medical/rest color, not two", () => {
    const medical = eventColorKey(baseInput({ category: "absence", period: "unspecified", absenceKind: "medical" }));
    const dayOff = eventColorKey(baseInput({ category: "absence", period: "unspecified", absenceKind: "day_off" }));
    expect(medical).toBe(dayOff);
    expect(medical).toBe("medical-rest");
  });

  it("rasar and oxid still have no existing semantic color/emoji anywhere to reuse -- stay unmapped, never forced", () => {
    expect(eventColorKey(baseInput({ category: "duty", period: "unspecified", dutyFamily: "rasar" }))).toBeNull();
    expect(eventColorKey(baseInput({ category: "duty", period: "unspecified", dutyFamily: "oxid" }))).toBeNull();
  });
});

describe("eventColorBgClassName", () => {
  it("returns the Tailwind soft-tint class for a mapped event", () => {
    expect(eventColorBgClassName(baseInput({ category: "shift", period: "day" }))).toBe("bg-event-shift-day-soft");
  });

  it("returns the shared reserve class for both reserve and callup duty families", () => {
    expect(eventColorBgClassName(baseInput({ category: "duty", period: "unspecified", dutyFamily: "reserve" }))).toBe(
      "bg-event-reserve-soft",
    );
    expect(eventColorBgClassName(baseInput({ category: "duty", period: "unspecified", dutyFamily: "callup" }))).toBe(
      "bg-event-reserve-soft",
    );
  });

  it("returns the shared medical-rest class for both medical and day_off absence kinds", () => {
    expect(
      eventColorBgClassName(baseInput({ category: "absence", period: "unspecified", absenceKind: "medical" })),
    ).toBe("bg-event-medical-rest-soft");
    expect(
      eventColorBgClassName(baseInput({ category: "absence", period: "unspecified", absenceKind: "day_off" })),
    ).toBe("bg-event-medical-rest-soft");
  });

  it("returns the morning-shift class for period 'morning'", () => {
    expect(eventColorBgClassName(baseInput({ category: "shift", period: "morning" }))).toBe(
      "bg-event-shift-morning-soft",
    );
  });

  it("returns null for an unmapped event -- the caller keeps its own default background", () => {
    expect(eventColorBgClassName(baseInput({ category: "duty", period: "unspecified", dutyFamily: "rasar" }))).toBeNull();
  });

  it("every distinct color key maps to a distinct class (no accidental collisions across the 11 slots)", () => {
    const inputs: EventColorInput[] = [
      baseInput({ category: "shift", period: "day" }),
      baseInput({ category: "shift", period: "night" }),
      baseInput({ category: "shift", period: "morning" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "vacation" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "after" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "referral" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "medical" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "evacuation_on_call" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "guard" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "reserve" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "full_kitchen" }),
    ];
    const classes = inputs.map((input) => eventColorBgClassName(input));
    expect(new Set(classes).size).toBe(11);
    expect(classes.every((c) => c !== null)).toBe(true);
  });
});
