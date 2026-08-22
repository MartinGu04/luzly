import { describe, expect, it } from "vitest";
import { computePeriodElapsedPercent, DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS, resolveDutyPaceStatus } from "./dutyPace";

describe("computePeriodElapsedPercent", () => {
  it("is 0% at the very start of the period", () => {
    expect(computePeriodElapsedPercent("2026-01-01", "2026-06-30", "2026-01-01")).toBe(0);
  });

  it("is 100% once the effective cutoff reaches the period end", () => {
    expect(computePeriodElapsedPercent("2026-01-01", "2026-06-30", "2026-06-30")).toBe(100);
  });

  it("is roughly 50% at the period's midpoint", () => {
    // Jan 1 -> Jun 30 is 180 days; Mar 31 is 89 days in.
    const value = computePeriodElapsedPercent("2026-01-01", "2026-06-30", "2026-03-31");
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThan(45);
    expect(value as number).toBeLessThan(55);
  });

  it("clamps to 100% even if effectiveEndDate somehow exceeds periodEndDate", () => {
    expect(computePeriodElapsedPercent("2026-01-01", "2026-06-30", "2026-12-31")).toBe(100);
  });

  it("clamps to 0% even if effectiveEndDate somehow precedes periodStartDate", () => {
    expect(computePeriodElapsedPercent("2026-01-01", "2026-06-30", "2025-12-01")).toBe(0);
  });

  it("returns null for an unparseable date", () => {
    expect(computePeriodElapsedPercent("bad", "2026-06-30", "2026-03-31")).toBeNull();
  });

  it("returns null for a zero-length period", () => {
    expect(computePeriodElapsedPercent("2026-01-01", "2026-01-01", "2026-01-01")).toBeNull();
  });
});

describe("resolveDutyPaceStatus", () => {
  it("is on_pace when progress exactly matches elapsed time", () => {
    expect(resolveDutyPaceStatus(50, 50)).toBe("on_pace");
  });

  it("is on_pace within the tolerance band (inclusive boundary)", () => {
    expect(resolveDutyPaceStatus(50 + DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS, 50)).toBe("on_pace");
    expect(resolveDutyPaceStatus(50 - DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS, 50)).toBe("on_pace");
  });

  it("is below_pace just past the negative tolerance boundary", () => {
    expect(resolveDutyPaceStatus(50 - DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS - 0.01, 50)).toBe("below_pace");
  });

  it("is ahead_of_pace just past the positive tolerance boundary", () => {
    expect(resolveDutyPaceStatus(50 + DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS + 0.01, 50)).toBe("ahead_of_pace");
  });
});
