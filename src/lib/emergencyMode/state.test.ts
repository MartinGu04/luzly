import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEmergencyDateSet } from "./state";
import type { EmergencyModePeriod } from "./types";

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

function period(overrides: Partial<EmergencyModePeriod> = {}): EmergencyModePeriod {
  return {
    id: "period1",
    activatedAt: "2026-08-26T14:00:00.000Z",
    activatedByUserId: "u1",
    activatedByPersonId: "p1",
    activatedByPersonName: "מנהל בדיקה",
    startDate: "2026-08-26",
    deactivatedAt: null,
    deactivatedByUserId: null,
    deactivatedByPersonId: null,
    deactivatedByPersonName: null,
    endDate: null,
    ...overrides,
  };
}

describe("buildEmergencyDateSet", () => {
  it("a period activated at 14:00 on a date excludes the WHOLE date -- 'dates are atomic'", () => {
    const set = buildEmergencyDateSet([period({ startDate: "2026-08-26", endDate: "2026-08-26" })], "2026-08-26");
    expect(set.has("2026-08-26")).toBe(true);
    expect(set.size).toBe(1);
  });

  it("expands a multi-day closed period inclusive of both endpoints", () => {
    const set = buildEmergencyDateSet([period({ startDate: "2026-08-20", endDate: "2026-08-22" })], "2026-08-26");
    expect([...set].sort()).toEqual(["2026-08-20", "2026-08-21", "2026-08-22"]);
  });

  it("a still-active period (endDate null) expands through today, not further", () => {
    const set = buildEmergencyDateSet([period({ startDate: "2026-08-24", endDate: null })], "2026-08-26");
    expect([...set].sort()).toEqual(["2026-08-24", "2026-08-25", "2026-08-26"]);
  });

  it("unions dates across multiple non-overlapping historical periods", () => {
    const set = buildEmergencyDateSet(
      [
        period({ id: "a", startDate: "2026-01-01", endDate: "2026-01-02" }),
        period({ id: "b", startDate: "2026-03-01", endDate: "2026-03-01" }),
      ],
      "2026-08-26",
    );
    expect([...set].sort()).toEqual(["2026-01-01", "2026-01-02", "2026-03-01"]);
  });

  it("correctly rolls a period across a month boundary", () => {
    const set = buildEmergencyDateSet([period({ startDate: "2026-01-30", endDate: "2026-02-02" })], "2026-08-26");
    expect([...set].sort()).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
  });

  it("returns an empty set for no periods", () => {
    expect(buildEmergencyDateSet([], "2026-08-26").size).toBe(0);
  });
});

describe("resolveOperationalMode", () => {
  it("resolves regular mode when no period is active", async () => {
    vi.doMock("./store", () => ({ getActiveEmergencyModePeriod: () => Promise.resolve(null) }));
    const { resolveOperationalMode } = await import("./state");

    expect(await resolveOperationalMode()).toEqual({ kind: "regular" });
  });

  it("resolves emergency mode with the active period when one exists", async () => {
    const active = period();
    vi.doMock("./store", () => ({ getActiveEmergencyModePeriod: () => Promise.resolve(active) }));
    const { resolveOperationalMode } = await import("./state");

    expect(await resolveOperationalMode()).toEqual({ kind: "emergency", period: active });
  });
});
