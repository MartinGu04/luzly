import { describe, expect, it } from "vitest";
import { formatMinutesHebrew, formatRemaining, formatStartsIn } from "./duration";

describe("formatMinutesHebrew", () => {
  it("formats a single minute vs plural minutes", () => {
    expect(formatMinutesHebrew(1)).toBe("דקה");
    expect(formatMinutesHebrew(2)).toBe("שתי דקות");
    expect(formatMinutesHebrew(42)).toBe("42 דקות");
  });

  it("formats a single hour vs two hours vs plural hours", () => {
    expect(formatMinutesHebrew(60)).toBe("שעה");
    expect(formatMinutesHebrew(120)).toBe("שעתיים");
    expect(formatMinutesHebrew(180)).toBe("3 שעות");
  });

  it("combines hours and minutes", () => {
    expect(formatMinutesHebrew(195)).toBe("3 שעות ו־15 דקות");
    expect(formatMinutesHebrew(61)).toBe("שעה ו־דקה");
  });

  it("clamps negative input to zero", () => {
    expect(formatMinutesHebrew(-5)).toBe("0 דקות");
  });
});

describe("formatRemaining / formatStartsIn", () => {
  it("prefixes remaining copy", () => {
    expect(formatRemaining(42)).toBe("נשארו 42 דקות");
  });

  it("prefixes starts-in copy", () => {
    expect(formatStartsIn(195)).toBe("מתחיל בעוד 3 שעות ו־15 דקות");
  });
});
