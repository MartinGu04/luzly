import { describe, expect, it } from "vitest";
import { firstNameOf, greetingForMinuteOfDay } from "./greeting";

describe("greetingForMinuteOfDay", () => {
  it("9. chooses the correct Hebrew daypart for each hour band", () => {
    expect(greetingForMinuteOfDay(6 * 60)).toBe("בוקר טוב"); // 06:00
    expect(greetingForMinuteOfDay(13 * 60)).toBe("צהריים טובים"); // 13:00
    expect(greetingForMinuteOfDay(18 * 60)).toBe("ערב טוב"); // 18:00
    expect(greetingForMinuteOfDay(23 * 60)).toBe("לילה טוב"); // 23:00
    expect(greetingForMinuteOfDay(2 * 60)).toBe("לילה טוב"); // 02:00
  });

  it("boundary hours land in the correct band", () => {
    expect(greetingForMinuteOfDay(5 * 60)).toBe("בוקר טוב"); // 05:00 start of morning
    expect(greetingForMinuteOfDay(4 * 60 + 59)).toBe("לילה טוב"); // 04:59 still night
    expect(greetingForMinuteOfDay(12 * 60)).toBe("צהריים טובים"); // noon
    expect(greetingForMinuteOfDay(17 * 60)).toBe("ערב טוב"); // 17:00 start of evening
    expect(greetingForMinuteOfDay(21 * 60)).toBe("לילה טוב"); // 21:00 start of night
  });
});

describe("firstNameOf", () => {
  it("10. handles a simple two-word name", () => {
    expect(firstNameOf("דני בדיקה")).toBe("דני");
  });

  it("10. handles a multi-word (three+ part) name safely", () => {
    expect(firstNameOf("נועה כהן לוי")).toBe("נועה");
  });

  it("handles extra internal/surrounding whitespace", () => {
    expect(firstNameOf("  דני   בדיקה  ")).toBe("דני");
  });

  it("handles a single-word name", () => {
    expect(firstNameOf("דני")).toBe("דני");
  });

  it("never throws on an empty/blank name", () => {
    expect(firstNameOf("")).toBe("");
    expect(firstNameOf("   ")).toBe("");
  });
});
