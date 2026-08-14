import { describe, expect, it } from "vitest";
import type { ManagerAbsenceEntry, ManagerDutyEntry, ManagerShiftOverviewEntry } from "@/lib/readModels/managerTypes";
import { buildScheduleEveryoneDayViews } from "./scheduleEveryone";

function staffingEntry(overrides: Partial<ManagerShiftOverviewEntry> = {}): ManagerShiftOverviewEntry {
  return {
    date: "2026-08-13",
    period: "day",
    technicians: [],
    supervisors: [],
    shadowTechnicians: [],
    shadowSupervisors: [],
    coverageStatus: "full",
    missingIntervals: [],
    roleCoverage: {
      technician: { status: "full", missingIntervals: [] },
      supervisor: { status: "full", missingIntervals: [] },
    },
    ...overrides,
  };
}

function duty(overrides: Partial<ManagerDutyEntry> = {}): ManagerDutyEntry {
  return {
    personId: "p_daniel",
    personName: "דניאל כהן",
    date: "2026-08-13",
    dutyFamily: "guard",
    slot: 1,
    certainty: "confirmed",
    ...overrides,
  };
}

function absence(overrides: Partial<ManagerAbsenceEntry> = {}): ManagerAbsenceEntry {
  return {
    personId: "p_eitan",
    personName: "איתן דוגמה",
    date: "2026-08-13",
    absenceKind: "vacation",
    certainty: "confirmed",
    ...overrides,
  };
}

const DATES = ["2026-08-13", "2026-08-14"];

describe("buildScheduleEveryoneDayViews", () => {
  it("splits day and night groups onto the same date's view", () => {
    const staffing = [
      staffingEntry({ period: "day", technicians: [{ personId: "p1", personName: "טוביה", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null }] }),
      staffingEntry({ period: "night", technicians: [{ personId: "p2", personName: "מרטין", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null }] }),
    ];
    const views = buildScheduleEveryoneDayViews(DATES, staffing, [], []);
    expect(views["2026-08-13"].day?.technicians.people.map((p) => p.name)).toEqual(["טוביה"]);
    expect(views["2026-08-13"].night?.technicians.people.map((p) => p.name)).toEqual(["מרטין"]);
  });

  it("a date with no staffing entries at all gets null day/night -- never a fabricated coverage verdict", () => {
    const views = buildScheduleEveryoneDayViews(DATES, [], [], []);
    expect(views["2026-08-14"].day).toBeNull();
    expect(views["2026-08-14"].night).toBeNull();
  });

  it("ignores 'morning'/'unspecified' periods -- only day/night are surfaced", () => {
    const staffing = [staffingEntry({ period: "morning" }), staffingEntry({ period: "unspecified" })];
    const views = buildScheduleEveryoneDayViews(DATES, staffing, [], []);
    expect(views["2026-08-13"].day).toBeNull();
    expect(views["2026-08-13"].night).toBeNull();
  });

  it("keeps shadow technicians/supervisors separate from primary staffing", () => {
    const staffing = [
      staffingEntry({
        shadowTechnicians: [{ personId: "p3", personName: "נועה", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null }],
      }),
    ];
    const views = buildScheduleEveryoneDayViews(DATES, staffing, [], []);
    expect(views["2026-08-13"].day?.shadowTechnicianNames).toEqual(["נועה"]);
    expect(views["2026-08-13"].day?.technicians.people).toEqual([]);
  });

  it("surfaces a missing role's explicit coverage message, not just an empty name list", () => {
    const staffing = [
      staffingEntry({
        roleCoverage: {
          technician: { status: "full", missingIntervals: [] },
          supervisor: { status: "missing", missingIntervals: [{ startMinute: 450, endMinute: 1170 }] },
        },
      }),
    ];
    const views = buildScheduleEveryoneDayViews(DATES, staffing, [], []);
    expect(views["2026-08-13"].day?.supervisors.status).toBe("missing");
    expect(views["2026-08-13"].day?.supervisors.message).toContain('אחמ"ש');
  });

  it("a not_evaluable role is never mislabeled as missing", () => {
    const staffing = [
      staffingEntry({
        roleCoverage: {
          technician: { status: "not_evaluable", missingIntervals: [] },
          supervisor: { status: "full", missingIntervals: [] },
        },
      }),
    ];
    const views = buildScheduleEveryoneDayViews(DATES, staffing, [], []);
    expect(views["2026-08-13"].day?.technicians.status).toBe("not_evaluable");
    expect(views["2026-08-13"].day?.technicians.message).not.toContain("חסר");
  });

  it("a partial role keeps its distinct status, not collapsed into missing", () => {
    const staffing = [
      staffingEntry({
        roleCoverage: {
          technician: { status: "partial", missingIntervals: [{ startMinute: 450, endMinute: 600 }] },
          supervisor: { status: "full", missingIntervals: [] },
        },
      }),
    ];
    const views = buildScheduleEveryoneDayViews(DATES, staffing, [], []);
    expect(views["2026-08-13"].day?.technicians.status).toBe("partial");
  });

  it("groups duties by date, preserving the person and title", () => {
    const duties = [duty({ personId: "p_a", personName: "אלון", date: "2026-08-13" }), duty({ personId: "p_b", personName: "בר", date: "2026-08-14" })];
    const views = buildScheduleEveryoneDayViews(DATES, [], duties, []);
    expect(views["2026-08-13"].duties.map((d) => d.personName)).toEqual(["אלון"]);
    expect(views["2026-08-14"].duties.map((d) => d.personName)).toEqual(["בר"]);
  });

  it("groups absences by date, preserving the person and label", () => {
    const absences = [absence({ personName: "איתן", date: "2026-08-13", absenceKind: "medical" })];
    const views = buildScheduleEveryoneDayViews(DATES, [], [], absences);
    expect(views["2026-08-13"].absences).toHaveLength(1);
    expect(views["2026-08-13"].absences[0].personName).toBe("איתן");
    expect(views["2026-08-13"].absences[0].label).toBe("גימלים");
  });
});
