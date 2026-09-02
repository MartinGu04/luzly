import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/domain/event";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import { buildShiftStaffingOverview } from "./managerEventProjections";

const schedule = buildShiftSchedule("07:30"); // day 07:30-19:30, night 19:30-07:30(+1)

let personCounter = 0;
function nextPersonId(): string {
  personCounter += 1;
  return `p_${personCounter}`;
}

function shiftEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: nextPersonId(),
    personName: "עילאי שפירא",
    date: "2026-01-10",
    title: 'אחמ"ש',
    rawValue: 'אחמ"ש',
    category: "shift",
    certainty: "confirmed",
    role: "supervisor",
    period: "unspecified",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: "C2",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: null,
    absenceKind: null,
    ...overrides,
  };
}

function supervisorGeneric(overrides: Partial<Event> = {}): Event {
  return shiftEvent({ role: "supervisor", period: "unspecified", ...overrides });
}

function supervisorDay(overrides: Partial<Event> = {}): Event {
  return shiftEvent({ role: "supervisor", period: "day", title: 'אחמ"ש יום', rawValue: 'אחמ"ש יום', ...overrides });
}

function supervisorNight(overrides: Partial<Event> = {}): Event {
  return shiftEvent({ role: "supervisor", period: "night", title: 'אחמ"ש לילה', rawValue: 'אחמ"ש לילה', ...overrides });
}

function technicianDay(overrides: Partial<Event> = {}): Event {
  return shiftEvent({ role: "technician", period: "day", title: "טכנאי יום", rawValue: "טכנאי יום", ...overrides });
}

function technicianNight(overrides: Partial<Event> = {}): Event {
  return shiftEvent({ role: "technician", period: "night", title: "טכנאי לילה", rawValue: "טכנאי לילה", ...overrides });
}

const DATES = new Set(["2026-01-10"]);

function entryFor(entries: ReturnType<typeof buildShiftStaffingOverview>, period: "day" | "night") {
  return entries.find((entry) => entry.date === "2026-01-10" && entry.period === period) ?? null;
}

describe('buildShiftStaffingOverview — generic (period-unspecified) role assignment, e.g. a weekend cell that just says אחמ"ש', () => {
  it('1. a generic אחמ"ש alongside a real day technician -> the DAY entry shows the supervisor as covered, never "missing"', () => {
    const generic = supervisorGeneric();
    const entries = buildShiftStaffingOverview([technicianDay(), generic], schedule, DATES);

    const day = entryFor(entries, "day")!;
    expect(day).not.toBeNull();
    expect(day.roleCoverage.supervisor.status).toBe("full");
    expect(day.coverageStatus).toBe("full");
  });

  it('2. the SAME generic אחמ"ש, alongside a real night technician -> the NIGHT entry also shows the supervisor as covered', () => {
    const generic = supervisorGeneric();
    const entries = buildShiftStaffingOverview([technicianNight(), generic], schedule, DATES);

    const night = entryFor(entries, "night")!;
    expect(night).not.toBeNull();
    expect(night.roleCoverage.supervisor.status).toBe("full");
    expect(night.coverageStatus).toBe("full");
  });

  it("reproduces the exact reported bug scenario end to end: a date staffed with a day technician, a night technician, and ONLY a generic supervisor -- BOTH periods show full supervisor coverage, never חסר אחמ״ש twice", () => {
    const generic = supervisorGeneric({ personName: "עילאי שפירא" });
    const entries = buildShiftStaffingOverview([technicianDay(), technicianNight(), generic], schedule, DATES);

    const day = entryFor(entries, "day")!;
    const night = entryFor(entries, "night")!;
    expect(day.roleCoverage.supervisor.status).toBe("full");
    expect(night.roleCoverage.supervisor.status).toBe("full");
    expect(day.coverageStatus).toBe("full");
    expect(night.coverageStatus).toBe("full");
  });

  it("3. a date with ONLY a generic supervisor (no other shift Events at all) still produces real day/night entries -- never silently absent -- and is never treated as two actual shift assignments", () => {
    const generic = supervisorGeneric();
    const entries = buildShiftStaffingOverview([generic], schedule, DATES);

    const day = entryFor(entries, "day")!;
    const night = entryFor(entries, "night")!;
    const genericEntry = entries.find((entry) => entry.date === "2026-01-10" && entry.period === "unspecified")!;
    expect(day).not.toBeNull();
    expect(night).not.toBeNull();

    // Supervisor role is COVERED on both from the ONE real assignment --
    // but the assignment's own roster/name lives ONLY in its native
    // "unspecified" entry, never duplicated into the day AND night
    // entries' own `supervisors` lists (that would misrepresent one
    // generic assignment as two independent shift assignments).
    expect(day.supervisors).toHaveLength(0);
    expect(night.supervisors).toHaveLength(0);
    expect(day.roleCoverage.supervisor.status).toBe("full");
    expect(night.roleCoverage.supervisor.status).toBe("full");
    expect(genericEntry.supervisors).toHaveLength(1);
    expect(genericEntry.supervisors[0].personId).toBe(generic.personId);

    // Technician is still genuinely missing on both -- the generic
    // supervisor assignment never spills over into covering a DIFFERENT
    // role.
    expect(day.roleCoverage.technician.status).toBe("missing");
    expect(night.roleCoverage.technician.status).toBe("missing");
  });

  describe('presentation/data-model boundary: a generic supervisor is never duplicated into both the day and night ASSIGNMENT lists (only its coverage verdict applies to both)', () => {
    it("satisfies both day and night supervisor coverage, suppresses both missing-supervisor warnings, yet is not a member of either period's own `supervisors` roster", () => {
      const generic = supervisorGeneric({ personName: "עילאי שפירא" });
      const entries = buildShiftStaffingOverview([technicianDay(), technicianNight(), generic], schedule, DATES);
      const day = entryFor(entries, "day")!;
      const night = entryFor(entries, "night")!;

      // 1. satisfies both day and night supervisor coverage
      expect(day.roleCoverage.supervisor.status).toBe("full");
      expect(night.roleCoverage.supervisor.status).toBe("full");
      // 2. suppresses both missing-supervisor warnings
      expect(day.coverageStatus).toBe("full");
      expect(night.coverageStatus).toBe("full");
      expect(day.missingIntervals).toHaveLength(0);
      expect(night.missingIntervals).toHaveLength(0);
      // 4. is NOT duplicated into both day and night assignment lists
      expect(day.supervisors).toHaveLength(0);
      expect(night.supervisors).toHaveLength(0);
      expect(day.supervisors.some((p) => p.personId === generic.personId)).toBe(false);
      expect(night.supervisors.some((p) => p.personId === generic.personId)).toBe(false);
    });

    it("3. remains one underlying assignment -- the exact same Event reference, never cloned, appears in exactly ONE entry's roster (its own native 'unspecified' entry)", () => {
      const generic = supervisorGeneric({ personName: "עילאי שפירא" });
      const entries = buildShiftStaffingOverview([technicianDay(), technicianNight(), generic], schedule, DATES);

      const entriesListingThisPerson = entries.filter((entry) =>
        entry.supervisors.some((p) => p.personId === generic.personId),
      );
      expect(entriesListingThisPerson).toHaveLength(1);
      expect(entriesListingThisPerson[0].period).toBe("unspecified");
      expect(entriesListingThisPerson[0].supervisors).toEqual([
        {
          personId: generic.personId,
          personName: generic.personName,
          certainty: generic.certainty,
          startTimeOverride: generic.startTimeOverride,
          endTimeOverride: generic.endTimeOverride,
        },
      ]);
    });
  });

  it("3b. the source Event array itself is never mutated or duplicated -- still exactly one Event in, one Event out, for the generic assignment", () => {
    const generic = supervisorGeneric();
    const events = [technicianDay(), technicianNight(), generic];
    const eventsBefore = [...events];
    buildShiftStaffingOverview(events, schedule, DATES);
    expect(events).toEqual(eventsBefore);
    expect(events).toHaveLength(3); // never grew a synthetic 4th Event
  });

  it('4. an explicit "אחמ"ש יום" (day-specific) event still covers ONLY the day entry -- unaffected regression', () => {
    const entries = buildShiftStaffingOverview([supervisorDay(), technicianDay(), technicianNight()], schedule, DATES);
    const day = entryFor(entries, "day")!;
    const night = entryFor(entries, "night")!;
    expect(day.roleCoverage.supervisor.status).toBe("full");
    expect(night.roleCoverage.supervisor.status).toBe("missing"); // day-specific event never leaks into night
  });

  it('5. an explicit "אחמ"ש לילה" (night-specific) event still covers ONLY the night entry -- unaffected regression', () => {
    const entries = buildShiftStaffingOverview([supervisorNight(), technicianDay(), technicianNight()], schedule, DATES);
    const day = entryFor(entries, "day")!;
    const night = entryFor(entries, "night")!;
    expect(night.roleCoverage.supervisor.status).toBe("full");
    expect(day.roleCoverage.supervisor.status).toBe("missing"); // night-specific event never leaks into day
  });

  it("a generic assignment for a DIFFERENT date never leaks into this date's coverage", () => {
    const genericOtherDate = supervisorGeneric({ date: "2026-01-11" });
    const entries = buildShiftStaffingOverview(
      [technicianDay(), technicianNight(), genericOtherDate],
      schedule,
      DATES,
    );
    const day = entryFor(entries, "day")!;
    expect(day.roleCoverage.supervisor.status).toBe("missing");
  });

  it("a shadow generic assignment (e.g. a period-less shadow אחמ״ש) never counts toward coverage on either period, and is never added to either period's own roster (its shadow context lives only in its native 'unspecified' entry)", () => {
    const shadowGeneric = supervisorGeneric({ shadow: true });
    const entries = buildShiftStaffingOverview([technicianDay(), technicianNight(), shadowGeneric], schedule, DATES);
    const day = entryFor(entries, "day")!;
    const night = entryFor(entries, "night")!;
    const genericEntry = entries.find((entry) => entry.date === "2026-01-10" && entry.period === "unspecified")!;
    expect(day.roleCoverage.supervisor.status).toBe("missing");
    expect(night.roleCoverage.supervisor.status).toBe("missing");
    // Never folded into either period's own shadow list -- that would be
    // the same "two independent shifts" misrepresentation the non-shadow
    // case guards against, just for the shadow list instead.
    expect(day.shadowSupervisors).toHaveLength(0);
    expect(night.shadowSupervisors).toHaveLength(0);
    // Its shadow context is still visible, once, on its own native entry.
    expect(genericEntry.shadowSupervisors).toHaveLength(1);
  });
});
