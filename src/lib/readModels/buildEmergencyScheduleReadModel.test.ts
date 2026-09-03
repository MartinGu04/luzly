import { describe, expect, it } from "vitest";
import type { EmergencyAssignment } from "@/lib/domain/emergencyShift";
import type { Person } from "@/lib/domain/types";
import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";
import { buildEmergencyScheduleReadModel } from "./buildEmergencyScheduleReadModel";

const PERIOD: EmergencyModePeriod = {
  id: "period1",
  activatedAt: "2026-08-26T14:00:00.000Z",
  activatedByUserId: "u1",
  activatedByPersonId: "p_mgr",
  activatedByPersonName: "מנהל בדיקה",
  startDate: "2026-08-26",
  deactivatedAt: null,
  deactivatedByUserId: null,
  deactivatedByPersonId: null,
  deactivatedByPersonName: null,
  endDate: null,
};

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "דני בדיקה",
    email: "dani@example.invalid",
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    dischargeDate: null,
    enlistmentDate: null,
    ...overrides,
  };
}

function assignment(overrides: Partial<EmergencyAssignment> = {}): EmergencyAssignment {
  return {
    date: "2026-08-26",
    period: "day",
    desk: "הוגוורט",
    personId: "p_self",
    personName: "מרטין",
    sourceCell: "C2",
    ...overrides,
  };
}

describe("buildEmergencyScheduleReadModel — non-manager", () => {
  it("forces perspective self, manager null, empty roster, regardless of requestedPersonId", () => {
    const model = buildEmergencyScheduleReadModel({
      manager: null,
      people: [],
      assignments: [assignment()],
      period: PERIOD,
      fetchedAt: "2026-08-26T14:05:00.000Z",
      now: { date: "2026-08-26", minuteOfDay: 600 },
      diagnostics: [],
      selfPersonId: "p_self",
      selfPersonName: "מרטין",
      requestedPersonId: "all",
    });

    expect(model.manager).toBeNull();
    expect(model.roster).toEqual([]);
    expect(model.perspective).toBe("self");
    expect(model.personalShifts).toHaveLength(1);
    expect(model.everyoneShifts).toBeNull();
  });
});

describe("buildEmergencyScheduleReadModel — manager 'all' perspective", () => {
  it("builds all ten canonical desks per shift, unstaffed ones marked with personName null (never a fabricated coverage gap)", () => {
    const manager = person({ id: "p_mgr", name: "מנהל בדיקה" });
    const model = buildEmergencyScheduleReadModel({
      manager: { id: manager.id, name: manager.name },
      people: [manager],
      assignments: [assignment({ desk: "הוגוורט", personId: "p_x", personName: "איקס" })],
      period: PERIOD,
      fetchedAt: "2026-08-26T14:05:00.000Z",
      now: { date: "2026-08-26", minuteOfDay: 600 },
      diagnostics: [],
      selfPersonId: "p_mgr",
      selfPersonName: "מנהל בדיקה",
      requestedPersonId: "all",
    });

    expect(model.perspective).toBe("all");
    expect(model.everyoneShifts).toHaveLength(1);
    expect(model.everyoneShifts?.[0].desks).toHaveLength(10);
    const staffed = model.everyoneShifts?.[0].desks.filter((d) => d.personName !== null);
    const unstaffed = model.everyoneShifts?.[0].desks.filter((d) => d.personName === null);
    expect(staffed).toEqual([{ desk: "הוגוורט", personId: "p_x", personName: "איקס" }]);
    expect(unstaffed).toHaveLength(9);
  });
});

describe("buildEmergencyScheduleReadModel — manager 'person' perspective", () => {
  it("shows the selected colleague's own desks and roster, not the manager's", () => {
    const manager = person({ id: "p_mgr", name: "מנהל בדיקה" });
    const colleague = person({ id: "p_colleague", name: "עמית בדיקה" });
    const model = buildEmergencyScheduleReadModel({
      manager: { id: manager.id, name: manager.name },
      people: [manager, colleague],
      assignments: [
        assignment({ desk: "הוגוורט", personId: "p_colleague", personName: "עמית בדיקה" }),
        assignment({ desk: "תיעוד", personId: "p_mgr", personName: "מנהל בדיקה", sourceCell: "J2" }),
      ],
      period: PERIOD,
      fetchedAt: "2026-08-26T14:05:00.000Z",
      now: { date: "2026-08-26", minuteOfDay: 600 },
      diagnostics: [],
      selfPersonId: "p_mgr",
      selfPersonName: "מנהל בדיקה",
      requestedPersonId: "p_colleague",
    });

    expect(model.perspective).toBe("person");
    expect(model.selectedPersonId).toBe("p_colleague");
    expect(model.personalShifts?.[0].ownDesks).toEqual(["הוגוורט"]);
    expect(model.personalShifts?.[0].roster.map((r) => r.personName)).toContain("מנהל בדיקה");
  });

  it("falls back to self for an unknown/foreign requested person id -- never throws, never 'all'", () => {
    const manager = person({ id: "p_mgr", name: "מנהל בדיקה" });
    const model = buildEmergencyScheduleReadModel({
      manager: { id: manager.id, name: manager.name },
      people: [manager],
      assignments: [],
      period: PERIOD,
      fetchedAt: "2026-08-26T14:05:00.000Z",
      now: { date: "2026-08-26", minuteOfDay: 600 },
      diagnostics: [],
      selfPersonId: "p_mgr",
      selfPersonName: "מנהל בדיקה",
      requestedPersonId: "does-not-exist",
    });

    expect(model.perspective).toBe("self");
  });
});
