import { describe, expect, it } from "vitest";
import { computeLiveEventProgress } from "./liveEventProgress";

const HOUR = 60 * 60 * 1000;
const START = Date.parse("2026-08-16T12:00:00.000Z");

describe("computeLiveEventProgress — before start", () => {
  it("hides an event starting more than 24h away", () => {
    const state = computeLiveEventProgress({ now: START - 25 * HOUR, start: START, end: null });
    expect(state.mode).toBe("hidden");
    expect(state.progressPercent).toBe(0);
  });

  it("becomes visible at exactly 24h before start, 0% progress", () => {
    const state = computeLiveEventProgress({ now: START - 24 * HOUR, start: START, end: null });
    expect(state.mode).toBe("countdown");
    expect(state.progressPercent).toBe(0);
    expect(state.remainingMinutes).toBe(24 * 60);
  });

  it("is around 50% at 12h before start", () => {
    const state = computeLiveEventProgress({ now: START - 12 * HOUR, start: START, end: null });
    expect(state.mode).toBe("countdown");
    expect(state.progressPercent).toBe(50);
    expect(state.remainingMinutes).toBe(12 * 60);
  });

  it("is almost 100% shortly before start", () => {
    const state = computeLiveEventProgress({ now: START - 5 * 60_000, start: START, end: null });
    expect(state.mode).toBe("countdown");
    expect(state.progressPercent).toBeGreaterThan(99);
    expect(state.progressPercent).toBeLessThan(100);
    expect(state.remainingMinutes).toBe(5);
  });

  it("works with no known end at all -- a countdown never needs one", () => {
    const state = computeLiveEventProgress({ now: START - HOUR, start: START, end: null });
    expect(state.mode).toBe("countdown");
  });
});

describe("computeLiveEventProgress — active (through the event)", () => {
  const END = START + 8 * HOUR;

  it("becomes active exactly at start, 0% progress", () => {
    const state = computeLiveEventProgress({ now: START, start: START, end: END });
    expect(state.mode).toBe("active");
    expect(state.progressPercent).toBe(0);
    expect(state.remainingMinutes).toBe(8 * 60);
  });

  it("is around 50% halfway through the event", () => {
    const state = computeLiveEventProgress({ now: START + 4 * HOUR, start: START, end: END });
    expect(state.mode).toBe("active");
    expect(state.progressPercent).toBe(50);
    expect(state.remainingMinutes).toBe(4 * 60);
  });

  it("never pretends an end exists once the event has started but none is known", () => {
    const state = computeLiveEventProgress({ now: START + HOUR, start: START, end: null });
    expect(state.mode).toBe("hidden");
  });

  it("is hidden (no stale active progress) once the event has ended", () => {
    const atEnd = computeLiveEventProgress({ now: END, start: START, end: END });
    expect(atEnd.mode).toBe("hidden");

    const afterEnd = computeLiveEventProgress({ now: END + HOUR, start: START, end: END });
    expect(afterEnd.mode).toBe("hidden");
    expect(afterEnd.progressPercent).toBe(0);
  });
});

describe("computeLiveEventProgress — no usable start", () => {
  it("hides an event without a usable start time (all-day/vacation/date-only)", () => {
    const state = computeLiveEventProgress({ now: START, start: null, end: null });
    expect(state.mode).toBe("hidden");
  });
});

describe("computeLiveEventProgress — clamping", () => {
  it("clamps countdown progress to [0, 100] even with an unusual input", () => {
    const wayBeforeStart = computeLiveEventProgress({ now: START - 1000 * HOUR, start: START, end: null });
    expect(wayBeforeStart.progressPercent).toBeGreaterThanOrEqual(0);

    const pastStart = computeLiveEventProgress({ now: START + 1, start: START, end: START + HOUR });
    expect(pastStart.progressPercent).toBeGreaterThanOrEqual(0);
    expect(pastStart.progressPercent).toBeLessThanOrEqual(100);
  });

  it("clamps active progress to [0, 100]", () => {
    const state = computeLiveEventProgress({ now: START + 100 * HOUR, start: START, end: START + HOUR });
    // now is already past end here, so this is "hidden", not an out-of-range active percent.
    expect(state.mode).toBe("hidden");
    expect(state.progressPercent).toBe(0);
  });
});
