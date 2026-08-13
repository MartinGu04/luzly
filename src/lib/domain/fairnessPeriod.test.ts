import { describe, expect, it } from "vitest";
import { fairnessPeriodLabel, parseFairnessPeriodParam, resolveFairnessPeriod } from "./fairnessPeriod";

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

describe("fairnessPeriodLabel", () => {
  it("formats h1 with the year read from LocalNow", () => {
    expect(fairnessPeriodLabel("h1", { date: "2026-03-15", minuteOfDay: 0 })).toBe("1–6/2026");
  });

  it("formats h2 with the year read from LocalNow", () => {
    expect(fairnessPeriodLabel("h2", { date: "2027-11-01", minuteOfDay: 0 })).toBe("7–12/2027");
  });
});
