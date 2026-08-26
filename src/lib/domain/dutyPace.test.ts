import { describe, expect, it } from "vitest";
import {
  computePeriodElapsedPercent,
  computePeriodElapsedPercentExcludingDates,
  DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS,
  resolveDutyPaceStatus,
} from "./dutyPace";

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

describe("computePeriodElapsedPercentExcludingDates — Emergency Mode date exclusion (spec section 19)", () => {
  it("an empty excludedDates set delegates to computePeriodElapsedPercent, byte-for-byte identical", () => {
    const withoutExclusion = computePeriodElapsedPercent("2026-01-01", "2026-06-30", "2026-03-31");
    const withEmptySet = computePeriodElapsedPercentExcludingDates("2026-01-01", "2026-06-30", "2026-03-31", new Set());
    expect(withEmptySet).toBe(withoutExclusion);
  });

  it("removes excluded dates from BOTH the numerator and denominator -- a fully-excluded short period is 100% at its very last non-excluded day", () => {
    // 5-day period, days 2-4 are all emergency dates -- only day 1 and day 5 are real, non-emergency days.
    const excluded = new Set(["2026-01-02", "2026-01-03", "2026-01-04"]);
    const value = computePeriodElapsedPercentExcludingDates("2026-01-01", "2026-01-05", "2026-01-05", excluded);
    expect(value).toBe(100);
  });

  it("an excluded date in the MIDDLE of the period never inflates elapsed% for a cutoff still before it", () => {
    // 10-day period, day 5 excluded. Cutoff at day 4 -> 4 of 9 non-emergency days elapsed.
    const excluded = new Set(["2026-01-05"]);
    const value = computePeriodElapsedPercentExcludingDates("2026-01-01", "2026-01-10", "2026-01-04", excluded);
    expect(value).not.toBeNull();
    expect(value as number).toBeCloseTo((4 / 9) * 100);
  });

  it("by the end of the period, elapsed reaches 100% of the NON-EMERGENCY timeline even with excluded dates scattered throughout", () => {
    const excluded = new Set(["2026-01-03", "2026-01-07"]);
    const value = computePeriodElapsedPercentExcludingDates("2026-01-01", "2026-01-10", "2026-01-10", excluded);
    expect(value).toBe(100);
  });

  it("returns null when EVERY date in the period is excluded (zero non-emergency days -- never a division by zero)", () => {
    const excluded = new Set(["2026-01-01", "2026-01-02", "2026-01-03"]);
    const value = computePeriodElapsedPercentExcludingDates("2026-01-01", "2026-01-03", "2026-01-03", excluded);
    expect(value).toBeNull();
  });

  it("returns null for an unparseable date, same as computePeriodElapsedPercent", () => {
    expect(computePeriodElapsedPercentExcludingDates("bad", "2026-06-30", "2026-03-31", new Set(["2026-01-01"]))).toBeNull();
  });

  it("clamps to [0, 100] even with excluded dates present", () => {
    const excluded = new Set(["2026-01-02"]);
    expect(computePeriodElapsedPercentExcludingDates("2026-01-01", "2026-01-10", "2025-12-01", excluded)).toBe(0);
    expect(computePeriodElapsedPercentExcludingDates("2026-01-01", "2026-01-10", "2026-12-31", excluded)).toBe(100);
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
