import { describe, expect, it } from "vitest";
import type { EmergencyModePeriod, OperationalMode } from "@/lib/emergencyMode/types";
import { resolveOperationalGeneration } from "./operationalGeneration";

function period(overrides: Partial<EmergencyModePeriod> = {}): EmergencyModePeriod {
  return {
    id: "period-a",
    activatedAt: "2026-08-26T06:00:00.000Z",
    activatedByUserId: "u_mgr",
    activatedByPersonId: "p_mgr",
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

describe("resolveOperationalGeneration", () => {
  it("regular mode resolves to the bare string 'regular'", () => {
    const mode: OperationalMode = { kind: "regular" };
    expect(resolveOperationalGeneration(mode)).toBe("regular");
  });

  it("emergency mode resolves to 'emergency:<periodId>', never the bare word 'emergency'", () => {
    const mode: OperationalMode = { kind: "emergency", period: period({ id: "period-a" }) };
    expect(resolveOperationalGeneration(mode)).toBe("emergency:period-a");
  });

  it("two different periods produce two different generation identities, even though both share kind 'emergency'", () => {
    const generationA = resolveOperationalGeneration({ kind: "emergency", period: period({ id: "period-a" }) });
    const generationB = resolveOperationalGeneration({ kind: "emergency", period: period({ id: "period-b" }) });
    expect(generationA).not.toBe(generationB);
  });

  it("the same period always resolves to the same generation identity (pure/deterministic)", () => {
    const mode: OperationalMode = { kind: "emergency", period: period({ id: "period-a" }) };
    expect(resolveOperationalGeneration(mode)).toBe(resolveOperationalGeneration(mode));
  });
});
