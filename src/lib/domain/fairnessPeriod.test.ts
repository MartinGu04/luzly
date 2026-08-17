import { describe, expect, it } from "vitest";
import {
  fairnessPeriodEndDate,
  fairnessPeriodIdentityLabel,
  fairnessPeriodLabel,
  parseFairnessPeriodParam,
  resolveFairnessPeriod,
  resolveFairnessPeriodIdentity,
} from "./fairnessPeriod";

describe("parseFairnessPeriodParam — strict allowlist", () => {
  it("accepts h1/h2", () => {
    expect(parseFairnessPeriodParam("h1")).toBe("h1");
    expect(parseFairnessPeriodParam("h2")).toBe("h2");
  });

  it("rejects anything else, including missing", () => {
    expect(parseFairnessPeriodParam("h3")).toBeNull();
    expect(parseFairnessPeriodParam(undefined)).toBeNull();
    expect(parseFairnessPeriodParam(null)).toBeNull();
    expect(parseFairnessPeriodParam("")).toBeNull();
  });
});

describe("resolveFairnessPeriod — Jerusalem LocalNow only, never browser-local date", () => {
  it("a valid explicit param wins regardless of the current date", () => {
    expect(resolveFairnessPeriod("h2", { date: "2026-02-01", minuteOfDay: 0 })).toBe("h2");
  });

  it("Jan-Jun falls back to h1 when the param is invalid/missing", () => {
    expect(resolveFairnessPeriod(null, { date: "2026-03-15", minuteOfDay: 0 })).toBe("h1");
    expect(resolveFairnessPeriod("bogus", { date: "2026-06-30", minuteOfDay: 0 })).toBe("h1");
  });

  it("Jul-Dec falls back to h2 when the param is invalid/missing", () => {
    expect(resolveFairnessPeriod(undefined, { date: "2026-08-13", minuteOfDay: 0 })).toBe("h2");
    expect(resolveFairnessPeriod("bogus", { date: "2026-12-31", minuteOfDay: 0 })).toBe("h2");
  });
});

describe("resolveFairnessPeriodIdentity — key AND year together (PR #39 year-safety)", () => {
  it("pairs the resolved key with the year read from the same date", () => {
    expect(resolveFairnessPeriodIdentity(null, { date: "2026-03-15", minuteOfDay: 0 })).toEqual({ key: "h1", year: 2026 });
    expect(resolveFairnessPeriodIdentity(null, { date: "2026-09-01", minuteOfDay: 0 })).toEqual({ key: "h2", year: 2026 });
  });

  it("two dates a year apart resolve to the SAME key but a DIFFERENT identity", () => {
    const y2026 = resolveFairnessPeriodIdentity(null, { date: "2026-02-10", minuteOfDay: 0 });
    const y2027 = resolveFairnessPeriodIdentity(null, { date: "2027-02-10", minuteOfDay: 0 });
    expect(y2026.key).toBe(y2027.key);
    expect(y2026).not.toEqual(y2027);
  });

  it("an explicit param still wins, exactly like resolveFairnessPeriod", () => {
    expect(resolveFairnessPeriodIdentity("h2", { date: "2026-02-10", minuteOfDay: 0 })).toEqual({ key: "h2", year: 2026 });
  });
});

describe("fairnessPeriodLabel", () => {
  it("formats h1 with the year read from LocalNow", () => {
    expect(fairnessPeriodLabel("h1", { date: "2026-03-15", minuteOfDay: 0 })).toBe("1–6/2026");
  });

  it("formats h2 with the year read from LocalNow", () => {
    expect(fairnessPeriodLabel("h2", { date: "2027-11-01", minuteOfDay: 0 })).toBe("7–12/2027");
  });
});

describe("fairnessPeriodIdentityLabel — same formatting, but from an already-resolved identity", () => {
  it("formats h1 from identity.year, independent of any LocalNow", () => {
    expect(fairnessPeriodIdentityLabel({ key: "h1", year: 2026 })).toBe("1–6/2026");
  });

  it("formats h2 from identity.year", () => {
    expect(fairnessPeriodIdentityLabel({ key: "h2", year: 2027 })).toBe("7–12/2027");
  });

  it("agrees exactly with fairnessPeriodLabel for the same key/year", () => {
    const now = { date: "2026-09-01", minuteOfDay: 0 };
    expect(fairnessPeriodIdentityLabel({ key: "h2", year: 2026 })).toBe(fairnessPeriodLabel("h2", now));
  });
});

describe("fairnessPeriodEndDate — K. H1/H2 period end dates for shared FairnessPeriodStatus resolution", () => {
  it("h1 ends June 30 of its own year", () => {
    expect(fairnessPeriodEndDate({ key: "h1", year: 2026 })).toBe("2026-06-30");
  });

  it("h2 ends December 31 of its own year", () => {
    expect(fairnessPeriodEndDate({ key: "h2", year: 2026 })).toBe("2026-12-31");
  });

  it("uses identity.year, never a hard-coded year", () => {
    expect(fairnessPeriodEndDate({ key: "h1", year: 2031 })).toBe("2031-06-30");
  });
});
