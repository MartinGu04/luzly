import { describe, expect, it } from "vitest";
import type { EmergencyAssignment } from "@/lib/domain/emergencyShift";
import type { Person } from "@/lib/domain/types";
import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";
import { EMERGENCY_FAIRNESS_GROUP_LABELS } from "@/lib/parsers/emergencyFairnessGroups";
import { buildEmergencyFairnessReadModel, EMERGENCY_FAIRNESS_FALLBACK_GROUP_LABEL } from "./buildEmergencyFairnessReadModel";

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
    name: "אליס בדיקה",
    email: "alice@example.invalid",
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

function assignment(overrides: Partial<EmergencyAssignment> = {}): EmergencyAssignment {
  return {
    date: "2026-08-26",
    period: "day",
    desk: "הוגוורט",
    personId: "p1",
    personName: "אליס בדיקה",
    sourceCell: "C2",
    ...overrides,
  };
}

function emptyMembership() {
  const membersByGroup = {} as Record<(typeof EMERGENCY_FAIRNESS_GROUP_LABELS)[number], string[]>;
  for (const label of EMERGENCY_FAIRNESS_GROUP_LABELS) membersByGroup[label] = [];
  return { membersByGroup };
}

describe("buildEmergencyFairnessReadModel", () => {
  it("places a resolved person into their matched גזירת נתונים group", () => {
    const membership = emptyMembership();
    membership.membersByGroup["טבלת צדק - קבע"] = ["אליס בדיקה"];

    const model = buildEmergencyFairnessReadModel({
      activePeriod: PERIOD,
      assignments: [assignment()],
      people: [person()],
      groupMembership: membership,
      fetchedAt: "2026-08-26T14:05:00.000Z",
    });

    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].label).toBe("טבלת צדק - קבע");
    expect(model.groups[0].rows[0]).toEqual({ personId: "p1", personName: "אליס בדיקה", total: 1, day: 1, night: 0 });
  });

  it("shows an assigned-but-ungrouped person in the fallback group -- never hidden", () => {
    const model = buildEmergencyFairnessReadModel({
      activePeriod: PERIOD,
      assignments: [assignment()],
      people: [person()],
      groupMembership: emptyMembership(),
      fetchedAt: "2026-08-26T14:05:00.000Z",
    });

    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].label).toBe(EMERGENCY_FAIRNESS_FALLBACK_GROUP_LABEL);
    expect(model.groups[0].rows[0].personId).toBe("p1");
  });

  it("does NOT use גזירת נתונים's numeric totals -- only the recomputed C:L count", () => {
    const membership = emptyMembership();
    membership.membersByGroup["טבלת צדק - קבע"] = ["אליס בדיקה"];

    const model = buildEmergencyFairnessReadModel({
      activePeriod: PERIOD,
      assignments: [assignment({ desk: "הוגוורט" }), assignment({ desk: "תיעוד", sourceCell: "J2" })],
      people: [person()],
      groupMembership: membership,
      fetchedAt: "2026-08-26T14:05:00.000Z",
    });

    expect(model.groups[0].rows[0].total).toBe(2);
  });

  it("omits empty groups entirely", () => {
    const membership = emptyMembership();
    membership.membersByGroup["טבלת צדק - מילואים"] = ["מישהו שלא שובץ"];

    const model = buildEmergencyFairnessReadModel({
      activePeriod: PERIOD,
      assignments: [],
      people: [],
      groupMembership: membership,
      fetchedAt: "2026-08-26T14:05:00.000Z",
    });

    expect(model.groups).toEqual([]);
  });

  it("a person unresolved in personnel still falls back safely using their raw id as display name", () => {
    const model = buildEmergencyFairnessReadModel({
      activePeriod: PERIOD,
      assignments: [assignment({ personId: "p_unknown", personName: "לא ידוע" })],
      people: [],
      groupMembership: emptyMembership(),
      fetchedAt: "2026-08-26T14:05:00.000Z",
    });

    expect(model.groups[0].label).toBe(EMERGENCY_FAIRNESS_FALLBACK_GROUP_LABEL);
    expect(model.groups[0].rows[0].personId).toBe("p_unknown");
  });
});
