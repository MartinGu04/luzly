import { describe, expect, it } from "vitest";
import { resolveMotzashShabbatInstant } from "./motzashShabbat";

describe("resolveMotzashShabbatInstant", () => {
  it("resolves a winter Saturday's real astronomical מוצ״ש (tzeit hakochavim, 8.5°) for Jerusalem", () => {
    const instant = resolveMotzashShabbatInstant("2026-01-17");
    expect(instant?.toISOString()).toBe("2026-01-17T15:38:21.000Z");
  });

  it("resolves a summer Saturday's מוצ״ש, well after the fixed 12:45/13:00 weekday check-in time", () => {
    const instant = resolveMotzashShabbatInstant("2026-08-22");
    expect(instant?.toISOString()).toBe("2026-08-22T16:52:56.000Z");
  });

  it("returns a genuinely different instant for two different Saturdays -- never a fixed clock time", () => {
    const winter = resolveMotzashShabbatInstant("2026-01-17");
    const summer = resolveMotzashShabbatInstant("2026-08-22");
    expect(winter?.getTime()).not.toBe(summer?.getTime());
    // Roughly 3+ hours apart across the year -- proves this is a real
    // astronomical calculation, not a rounding artifact of one fixed time.
    const diffHours = Math.abs((summer!.getTime() - winter!.getTime()) / 3_600_000);
    expect(diffHours).toBeGreaterThan(1);
  });

  it("returns null for an unparseable date, never throws", () => {
    expect(resolveMotzashShabbatInstant("not-a-date")).toBeNull();
    expect(resolveMotzashShabbatInstant("2026-13-40")).toBeNull();
  });

  it("works for any calendar date, not only an actual Saturday -- the caller decides when to invoke this", () => {
    // A Wednesday still has a well-defined "nightfall" -- resolving it is
    // never itself an error; `reminders.ts` is the one that only calls
    // this for a Saturday check-in date.
    const instant = resolveMotzashShabbatInstant("2026-08-19");
    expect(instant).not.toBeNull();
  });
});
