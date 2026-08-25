import { describe, expect, it } from "vitest";
import { computeRemainingProgress, formatDurationParts, formatDurationUnitsLabel } from "./shootingRangeDuration";

describe("formatDurationParts", () => {
  it("breaks a duration into days/hours/minutes/seconds", () => {
    const ms = 2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000 + 5_000;
    expect(formatDurationParts(ms)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  it("clamps negative durations to zero", () => {
    expect(formatDurationParts(-1000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("floors sub-second remainders", () => {
    expect(formatDurationParts(1999)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
  });
});

describe("formatDurationUnitsLabel", () => {
  it("zero-pads hours/minutes/seconds and gives every number its own explicit Hebrew unit word", () => {
    expect(formatDurationUnitsLabel({ days: 0, hours: 8, minutes: 4, seconds: 7 })).toBe("08 שעות · 04 דקות · 07 שניות");
  });

  it("never renders a bare, unexplained HH:MM:SS-shaped string", () => {
    const label = formatDurationUnitsLabel({ days: 0, hours: 1, minutes: 41, seconds: 4 });
    expect(label).not.toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(label).toContain("שעות");
    expect(label).toContain("דקות");
    expect(label).toContain("שניות");
  });
});

describe("computeRemainingProgress", () => {
  const START = new Date("2026-08-10T00:00:00.000Z").getTime();
  const EXPIRY = new Date("2027-02-10T00:00:00.000Z").getTime(); // 184 days later
  const WINDOW = EXPIRY - START;

  it("is ~1 (nearly full) immediately after the baseline -- a fresh qualification, not a nearly-empty ring", () => {
    expect(computeRemainingProgress(START, START, EXPIRY)).toBe(1);
    expect(computeRemainingProgress(START + 60_000, START, EXPIRY)).toBeCloseTo(1, 3);
  });

  it("is ~0.5 halfway through the qualification window", () => {
    const midpoint = START + WINDOW / 2;
    expect(computeRemainingProgress(midpoint, START, EXPIRY)).toBeCloseTo(0.5, 6);
  });

  it("approaches 0 as expiry nears", () => {
    const almostExpired = EXPIRY - 60_000;
    expect(computeRemainingProgress(almostExpired, START, EXPIRY)).toBeLessThan(0.001);
    expect(computeRemainingProgress(almostExpired, START, EXPIRY)).toBeGreaterThan(0);
  });

  it("is exactly 0 at expiry, and stays 0 for any time after expiry -- never negative, never a misleadingly-full ring", () => {
    expect(computeRemainingProgress(EXPIRY, START, EXPIRY)).toBe(0);
    expect(computeRemainingProgress(EXPIRY + 30 * 86_400_000, START, EXPIRY)).toBe(0);
  });

  it("never exceeds 1, even for a instant before the baseline itself", () => {
    expect(computeRemainingProgress(START - 60_000, START, EXPIRY)).toBe(1);
  });

  it("strictly decreases as time advances during a valid qualification -- it never increases", () => {
    const t1 = computeRemainingProgress(START + WINDOW * 0.2, START, EXPIRY);
    const t2 = computeRemainingProgress(START + WINDOW * 0.4, START, EXPIRY);
    const t3 = computeRemainingProgress(START + WINDOW * 0.6, START, EXPIRY);
    expect(t2).toBeLessThan(t1);
    expect(t3).toBeLessThan(t2);
  });

  it("matches the reported example: 10/08/2026 -> 10/02/2027, viewed in late August 2026, is close to full (~169 of ~184 days remaining)", () => {
    const lateAugust = new Date("2026-08-25T00:00:00.000Z").getTime();
    const progress = computeRemainingProgress(lateAugust, START, EXPIRY);
    expect(progress).toBeGreaterThan(0.9);
    expect(progress).toBeCloseTo(169 / 184, 1);
  });
});
