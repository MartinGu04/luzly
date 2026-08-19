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

  it("a shift with period 'morning' has no dedicated slot -- degrades to null, never a guessed color", () => {
    expect(eventColorKey(baseInput({ category: "shift", period: "morning" }))).toBeNull();
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
    ["reserve", null],
    ["callup", null],
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
    ["medical", null],
    ["day_off", null],
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
});

describe("eventColorBgClassName", () => {
  it("returns the Tailwind soft-tint class for a mapped event", () => {
    expect(eventColorBgClassName(baseInput({ category: "shift", period: "day" }))).toBe("bg-event-shift-day-soft");
  });

  it("returns null for an unmapped event -- the caller keeps its own default background", () => {
    expect(eventColorBgClassName(baseInput({ category: "duty", period: "unspecified", dutyFamily: "rasar" }))).toBeNull();
  });

  it("every distinct color key maps to a distinct class (no accidental collisions across the 8 slots)", () => {
    const inputs: EventColorInput[] = [
      baseInput({ category: "shift", period: "day" }),
      baseInput({ category: "shift", period: "night" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "vacation" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "after" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "referral" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "evacuation_on_call" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "guard" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "full_kitchen" }),
    ];
    const classes = inputs.map((input) => eventColorBgClassName(input));
    expect(new Set(classes).size).toBe(8);
    expect(classes.every((c) => c !== null)).toBe(true);
  });
});
