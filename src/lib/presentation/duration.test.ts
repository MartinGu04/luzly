import { describe, expect, it } from "vitest";
import { formatCountdownToStart, formatMinutesHebrew, formatRemaining, formatStartsIn } from "./duration";

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

describe("formatCountdownToStart", () => {
  it("shows hour-only wording 24h down to 6h away, no minute noise", () => {
    expect(formatCountdownToStart(24 * 60)).toBe("מתחיל בעוד 24 שעות");
    expect(formatCountdownToStart(578)).toBe("מתחיל בעוד 9 שעות"); // 9h38m -- minutes deliberately dropped this far out
    expect(formatCountdownToStart(360)).toBe("מתחיל בעוד 6 שעות");
  });

  it("switches to hour+minute wording just below the 6h boundary", () => {
    expect(formatCountdownToStart(359)).toBe("מתחיל בעוד 5 שעות ו־59 דקות");
  });

  it("switches to minute-only wording below the 1h boundary", () => {
    expect(formatCountdownToStart(59)).toBe("מתחיל בעוד 59 דקות");
    expect(formatCountdownToStart(1)).toBe("מתחיל בעוד דקה");
  });

  it("stays on hour(+minute) wording at exactly 1h", () => {
    expect(formatCountdownToStart(60)).toBe("מתחיל בעוד שעה");
  });
});
