import { describe, expect, it } from "vitest";
import { eventColorKey, type EventColorInput } from "@/lib/presentation/eventColor";
import { icsEventColor } from "./icsColor";

function baseInput(overrides: Partial<EventColorInput> = {}): EventColorInput {
  return { category: "shift", period: "day", dutyFamily: null, absenceKind: null, ...overrides };
}

describe("icsEventColor", () => {
  it("reuses the exact same semantic slot as the in-app eventColorKey -- one mapping decision, not two", () => {
    const cases: EventColorInput[] = [
      baseInput({ category: "shift", period: "day" }),
      baseInput({ category: "shift", period: "night" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "vacation" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "after" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "referral" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "evacuation_on_call" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "guard" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "full_kitchen" }),
      baseInput({ category: "shift", period: "morning" }),
      baseInput({ category: "absence", period: "unspecified", absenceKind: "medical" }),
      baseInput({ category: "duty", period: "unspecified", dutyFamily: "reserve" }),
    ];
    for (const input of cases) {
      const key = eventColorKey(input);
      expect(key).not.toBeNull();
      expect(icsEventColor(input)).not.toBeNull();
    }
  });

  it("returns a plain CSS3 color keyword, not a hex value, per RFC 7986's TEXT value type", () => {
    const color = icsEventColor(baseInput({ category: "shift", period: "day" }));
    expect(color).toMatch(/^[a-z]+$/);
  });

  it("reserve and callup get the exact same keyword -- one shared color, not two", () => {
    const reserve = icsEventColor(baseInput({ category: "duty", period: "unspecified", dutyFamily: "reserve" }));
    const callup = icsEventColor(baseInput({ category: "duty", period: "unspecified", dutyFamily: "callup" }));
    expect(reserve).not.toBeNull();
    expect(reserve).toBe(callup);
  });

  it("medical and day_off get the exact same keyword -- one shared color, not two", () => {
    const medical = icsEventColor(baseInput({ category: "absence", period: "unspecified", absenceKind: "medical" }));
    const dayOff = icsEventColor(baseInput({ category: "absence", period: "unspecified", absenceKind: "day_off" }));
    expect(medical).not.toBeNull();
    expect(medical).toBe(dayOff);
  });

  it("degrades to null for an unmapped event, same as the in-app mapping", () => {
    expect(icsEventColor(baseInput({ category: "duty", period: "unspecified", dutyFamily: "rasar" }))).toBeNull();
    expect(icsEventColor(baseInput({ category: "duty", period: "unspecified", dutyFamily: "oxid" }))).toBeNull();
    expect(icsEventColor(baseInput({ category: "shift", period: "unspecified" }))).toBeNull();
  });

  it("night shift and day shift get different keywords", () => {
    const day = icsEventColor(baseInput({ category: "shift", period: "day" }));
    const night = icsEventColor(baseInput({ category: "shift", period: "night" }));
    expect(day).not.toBe(night);
  });
});
