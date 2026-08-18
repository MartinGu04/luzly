import { describe, expect, it } from "vitest";
import { shiftFairnessPeriodLabel } from "./shiftFairnessPeriodLabel";

describe("shiftFairnessPeriodLabel", () => {
  it("the actual current month appends ' · עד היום'", () => {
    expect(shiftFairnessPeriodLabel("אוגוסט 2026", true)).toBe("תקופת החישוב: אוגוסט 2026 · עד היום");
  });

  it("a non-current month (closed historical OR future) never appends the suffix", () => {
    expect(shiftFairnessPeriodLabel("יולי 2026", false)).toBe("תקופת החישוב: יולי 2026");
    expect(shiftFairnessPeriodLabel("יולי 2027", false)).toBe("תקופת החישוב: יולי 2027");
  });
});
