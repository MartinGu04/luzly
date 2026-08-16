import { describe, expect, it } from "vitest";
import { formatRecentChangeRelativeTime } from "./relativeChangeTime";

const NOW = new Date("2026-08-16T12:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60_000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60_000).toISOString();
}

describe("formatRecentChangeRelativeTime", () => {
  it("under a minute reads עכשיו", () => {
    expect(formatRecentChangeRelativeTime(minutesAgo(0), NOW)).toBe("עכשיו");
  });

  it("a future instant (clock skew) also reads עכשיו, never a negative/future claim", () => {
    const future = new Date(NOW.getTime() + 5000).toISOString();
    expect(formatRecentChangeRelativeTime(future, NOW)).toBe("עכשיו");
  });

  it("singular minute", () => {
    expect(formatRecentChangeRelativeTime(minutesAgo(1), NOW)).toBe("לפני דקה");
  });

  it("plural minutes", () => {
    expect(formatRecentChangeRelativeTime(minutesAgo(18), NOW)).toBe("לפני 18 דקות");
  });

  it("singular hour", () => {
    expect(formatRecentChangeRelativeTime(hoursAgo(1), NOW)).toBe("לפני שעה");
  });

  it("plural hours", () => {
    expect(formatRecentChangeRelativeTime(hoursAgo(5), NOW)).toBe("לפני 5 שעות");
  });

  it("exactly one day reads אתמול", () => {
    expect(formatRecentChangeRelativeTime(daysAgo(1), NOW)).toBe("אתמול");
  });

  it("exactly two days reads לפני יומיים", () => {
    expect(formatRecentChangeRelativeTime(daysAgo(2), NOW)).toBe("לפני יומיים");
  });

  it("three or more days reads a plain count", () => {
    expect(formatRecentChangeRelativeTime(daysAgo(3), NOW)).toBe("לפני 3 ימים");
  });

  it("an unparseable timestamp fails safe with a generic label, never NaN/crash", () => {
    expect(formatRecentChangeRelativeTime("not-a-date", NOW)).toBe("לאחרונה");
  });
});
