import { describe, expect, it } from "vitest";
import { formatDataFreshnessLabel } from "./dataFreshness";

const NOW = new Date("2026-08-13T12:00:00.000Z");

function fetchedSecondsAgo(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe("formatDataFreshnessLabel — deterministic boundaries (PR #17 §17)", () => {
  it("0 seconds -> עודכן עכשיו", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(0), NOW)).toBe("עודכן עכשיו");
  });

  it("30 seconds -> עודכן עכשיו", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(30), NOW)).toBe("עודכן עכשיו");
  });

  it("59 seconds -> עודכן עכשיו", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(59), NOW)).toBe("עודכן עכשיו");
  });

  it("60 seconds (1 minute) -> עודכן לפני דקה", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(60), NOW)).toBe("עודכן לפני דקה");
  });

  it("1 minute (explicit) -> עודכן לפני דקה", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(60), NOW)).toBe("עודכן לפני דקה");
  });

  it("119 seconds (still 1 minute) -> עודכן לפני דקה", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(119), NOW)).toBe("עודכן לפני דקה");
  });

  it("2 minutes -> עודכן לפני 2 דקות", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(120), NOW)).toBe("עודכן לפני 2 דקות");
  });

  it("59 minutes -> עודכן לפני 59 דקות", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(59 * 60), NOW)).toBe("עודכן לפני 59 דקות");
  });

  it("60 minutes (1 hour) -> עודכן לפני שעה", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(60 * 60), NOW)).toBe("עודכן לפני שעה");
  });

  it("multiple hours (e.g. 3) -> עודכן לפני 3 שעות", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(3 * 60 * 60), NOW)).toBe("עודכן לפני 3 שעות");
  });

  it("many hours (e.g. 30) -> עודכן לפני 30 שעות, a restrained representation with no invented day bucket", () => {
    expect(formatDataFreshnessLabel(fetchedSecondsAgo(30 * 60 * 60), NOW)).toBe("עודכן לפני 30 שעות");
  });
});

describe("formatDataFreshnessLabel — never accusatory, never claims sync/save", () => {
  it("does not contain misleading sync/save language at any age", () => {
    for (const seconds of [0, 90, 3600, 7200]) {
      const label = formatDataFreshnessLabel(fetchedSecondsAgo(seconds), NOW);
      expect(label).not.toContain("מסונכרן");
      expect(label).not.toContain("נשמר");
      expect(label).not.toContain("סנכרון");
    }
  });
});

describe("formatDataFreshnessLabel — invalid input fails safely", () => {
  it("an unparseable timestamp returns a generic fallback, never throws, never 'NaN'", () => {
    expect(() => formatDataFreshnessLabel("not-a-real-date", NOW)).not.toThrow();
    const label = formatDataFreshnessLabel("not-a-real-date", NOW);
    expect(label).toBe("עודכן");
    expect(label).not.toContain("NaN");
  });

  it("an empty string fails safely", () => {
    expect(formatDataFreshnessLabel("", NOW)).toBe("עודכן");
  });
});

describe("formatDataFreshnessLabel — clock skew never produces a negative/future label", () => {
  it("a fetchedAt slightly in the future (skewed clocks) reads as 'just now', never negative", () => {
    const future = new Date(NOW.getTime() + 5_000).toISOString();
    expect(formatDataFreshnessLabel(future, NOW)).toBe("עודכן עכשיו");
  });
});
