import { describe, expect, it } from "vitest";
import type { LocalNow } from "@/lib/domain/localNow";
import { ICS_FEED_PAST_WINDOW_DAYS, icsFeedCutoffDate, isWithinIcsFeedWindow } from "./icsWindow";

const NOW: LocalNow = { date: "2026-08-19", minuteOfDay: 600 };

describe("icsFeedCutoffDate", () => {
  it("is exactly ICS_FEED_PAST_WINDOW_DAYS (30) days before now.date", () => {
    expect(ICS_FEED_PAST_WINDOW_DAYS).toBe(30);
    expect(icsFeedCutoffDate(NOW)).toBe("2026-07-20");
  });

  it("rolls correctly across a month boundary", () => {
    expect(icsFeedCutoffDate({ date: "2026-01-15", minuteOfDay: 0 })).toBe("2025-12-16");
  });

  it("rolls correctly across a year boundary", () => {
    expect(icsFeedCutoffDate({ date: "2026-01-05", minuteOfDay: 0 })).toBe("2025-12-06");
  });

  it("rolls correctly across a leap-year February", () => {
    // 2028 is a leap year -- Feb has 29 days.
    expect(icsFeedCutoffDate({ date: "2028-03-10", minuteOfDay: 0 })).toBe("2028-02-09");
  });

  it("degrades to today itself (never throws) for an unparseable now.date", () => {
    expect(icsFeedCutoffDate({ date: "not-a-date", minuteOfDay: 0 })).toBe("not-a-date");
  });
});

describe("isWithinIcsFeedWindow", () => {
  it("includes today", () => {
    expect(isWithinIcsFeedWindow("2026-08-19", NOW)).toBe(true);
  });

  it("includes the cutoff date itself (inclusive lower bound)", () => {
    expect(isWithinIcsFeedWindow("2026-07-20", NOW)).toBe(true);
  });

  it("excludes one day before the cutoff", () => {
    expect(isWithinIcsFeedWindow("2026-07-19", NOW)).toBe(false);
  });

  it("excludes an old date well outside the window", () => {
    expect(isWithinIcsFeedWindow("2020-01-01", NOW)).toBe(false);
  });

  it("includes a near-future date", () => {
    expect(isWithinIcsFeedWindow("2026-08-20", NOW)).toBe(true);
  });

  it("has no upper bound at all -- includes a date years in the future", () => {
    expect(isWithinIcsFeedWindow("2099-12-31", NOW)).toBe(true);
  });
});
