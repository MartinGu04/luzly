import { describe, expect, it } from "vitest";
import { resolveManagerDateRange } from "@/lib/domain/dateRange";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import type { PotentialAllocation } from "@/lib/domain/potentialAllocation";
import { buildManagerOverviewReadModel } from "./buildManagerOverviewReadModel";

// day 07:30-19:30, night 19:30-07:30(+1)
const schedule = buildShiftSchedule("07:30");
const now: LocalNow = { date: "2026-08-13", minuteOfDay: 600 };

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_x",
    name: "שם",
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

const MANAGER = person({ id: "p_manager", name: "דני מנהל", isManager: true });
const MARTIN = person({ id: "p_martin", name: "מרטין בדיקה", isTechnician: true });
const EITAN = person({ id: "p_eitan", name: "איתן דוגמה", isSupervisor: true });
const NOA = person({ id: "p_noa", name: "נועה דוגמה", isTechnician: true });

function event(overrides: Partial<Event> = {}): Event {
  return {
    personId: MARTIN.id,
    personName: MARTIN.name,
    date: "2026-08-13",
    title: "טכנאי יום",
    rawValue: "טכנאי יום",
    category: "shift",
    certainty: "confirmed",
    role: "technician",
    period: "day",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: nextCell(),
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

function allocation(overrides: Partial<PotentialAllocation> = {}): PotentialAllocation {
  return {
    date: "2026-08-13",
    dutyFamily: "evacuation_on_call",
    slot: null,
    sourceSlot: null,
    columnLabel: "כונן פינויים",
    sourceAllocationLabel: "מרטין בדיקה",
    resolvedSourcePersonId: MARTIN.id,
    sourceSheet: 'פוטנציאל תקש"אס 1-6/2026',
    sourceCell: nextCell(),
    ...overrides,
  };
}

function range7d() {
  return resolveManagerDateRange("7d", null, now);
}

function buildModel(overrides: Partial<Parameters<typeof buildManagerOverviewReadModel>[0]> = {}) {
  return buildManagerOverviewReadModel({
    manager: MANAGER,
    people: [MANAGER, MARTIN, EITAN, NOA],
    events: [],
    potentialAllocations: [],
    shiftSchedule: schedule,
    fetchedAt: "2026-08-13T08:00:00.000Z",
    now,
    range: range7d(),
    selectedPersonId: null,
    problemsOnly: false,
    ...overrides,
  });
}

describe("buildManagerOverviewReadModel — roster", () => {
  it("includes every person visible to the manager", () => {
    const model = buildModel();
    expect(model.roster).toHaveLength(4);
    expect(model.roster.map((p) => p.id).sort()).toEqual(
      [MANAGER.id, MARTIN.id, EITAN.id, NOA.id].sort(),
    );
  });

  it("sorts the roster deterministically by name, then id as a tiebreak", () => {
    const dup1 = person({ id: "p_b", name: "כפול" });
    const dup2 = person({ id: "p_a", name: "כפול" });
    const model = buildModel({ people: [dup1, dup2] });
    expect(model.roster.map((p) => p.id)).toEqual(["p_a", "p_b"]);
  });

  it("never exposes email on the roster", () => {
    const withEmail = person({ id: "p_e", name: "עם מייל", email: "someone@example.invalid" });
    const model = buildModel({ people: [withEmail] });
    expect(JSON.stringify(model.roster)).not.toContain("someone@example.invalid");
  });
});

describe("buildManagerOverviewReadModel — global issues", () => {
  it("surfaces issues across several different people", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", category: "shift", role: "technician", period: "day" }),
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "absence", role: null, period: "unspecified", rawValue: "חופש", title: "חופש", absenceKind: "vacation" }),
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "shift", role: "supervisor", period: "day", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    const affectedPeople = new Set(model.issues.map((issue) => issue.personId));
    expect(affectedPeople.has(EITAN.id)).toBe(true);
  });

  it("issue projection is sanitized -- no sourceSheet/sourceCell/raw evidence Events", () => {
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, category: "absence", role: null, absenceKind: "vacation" }),
      event({ personId: EITAN.id, personName: EITAN.name, category: "shift", role: "supervisor", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    const serialized = JSON.stringify(model.issues);
    expect(serialized).not.toContain("sourceSheet");
    expect(serialized).not.toContain("sourceCell");
    expect(serialized).not.toContain('"events"');
  });

  it("filters issues to the selected range", () => {
    const inRange = event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "absence", role: null, absenceKind: "vacation" });
    const outOfRange = event({ personId: EITAN.id, personName: EITAN.name, date: "2026-09-30", category: "absence", role: null, absenceKind: "vacation", sourceCell: nextCell() });
    const model = buildModel({
      events: [
        inRange,
        event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "shift", role: "supervisor", sourceCell: nextCell() }),
        outOfRange,
        event({ personId: EITAN.id, personName: EITAN.name, date: "2026-09-30", category: "shift", role: "supervisor", sourceCell: nextCell() }),
      ],
    });
    expect(model.issues.every((issue) => issue.date === "2026-08-13")).toBe(true);
  });
});

describe("buildManagerOverviewReadModel — coverage overview", () => {
  it("preserves multiple people in the same date+period group, never collapsed", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", role: "technician", period: "day" }),
      event({ personId: NOA.id, personName: NOA.name, date: "2026-08-13", role: "technician", period: "day", sourceCell: nextCell() }),
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", role: "supervisor", period: "day", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    const group = model.coverageOverview.find((g) => g.date === "2026-08-13" && g.period === "day");
    expect(group).toBeDefined();
    expect(group?.technicians.map((p) => p.personId).sort()).toEqual([MARTIN.id, NOA.id].sort());
    expect(group?.supervisors.map((p) => p.personId)).toEqual([EITAN.id]);
  });

  it("keeps shadow people in their own separate lists", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", role: "technician", period: "day", shadow: false }),
      event({ personId: NOA.id, personName: NOA.name, date: "2026-08-13", role: "technician", period: "day", shadow: true, sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    const group = model.coverageOverview.find((g) => g.date === "2026-08-13" && g.period === "day");
    expect(group?.technicians.map((p) => p.personId)).toEqual([MARTIN.id]);
    expect(group?.shadowTechnicians.map((p) => p.personId)).toEqual([NOA.id]);
  });

  it("computes coverage status via the real domain algorithm (full when both roles present)", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", role: "technician", period: "day" }),
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", role: "supervisor", period: "day", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    const group = model.coverageOverview.find((g) => g.date === "2026-08-13" && g.period === "day");
    expect(group?.coverageStatus).toBe("full");
    expect(group?.missingIntervals).toEqual([]);
  });

  it("reports missing coverage when only one role is present", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", role: "technician", period: "day" }),
    ];
    const model = buildModel({ events });
    const group = model.coverageOverview.find((g) => g.date === "2026-08-13" && g.period === "day");
    expect(group?.coverageStatus).toBe("missing");
  });

  it("filters coverage entries to the selected range", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, date: "2026-08-13" }),
      event({ personId: MARTIN.id, date: "2026-09-30", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    expect(model.coverageOverview.every((g) => g.date === "2026-08-13")).toBe(true);
  });

  it("group coverage status is independent of which person's id sorts first (regression for the old sortedGroup[0] bug)", () => {
    // Two technicians, one full-day and one partial; a naive "pick sortedGroup[0]" implementation would have
    // reported the group's status/missingIntervals purely from whichever technician happened to sort first.
    const eventsAsc: Event[] = [
      event({ personId: "p_aaa", personName: "טכנאי א", date: "2026-08-13", role: "technician", period: "day", endTimeOverride: "12:00" }),
      event({ personId: "p_zzz", personName: "טכנאי ב", date: "2026-08-13", role: "technician", period: "day", sourceCell: nextCell() }),
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", role: "supervisor", period: "day", sourceCell: nextCell() }),
    ];
    const eventsDesc = [...eventsAsc].reverse();

    const groupAsc = buildModel({ events: eventsAsc }).coverageOverview.find(
      (g) => g.date === "2026-08-13" && g.period === "day",
    );
    const groupDesc = buildModel({ events: eventsDesc }).coverageOverview.find(
      (g) => g.date === "2026-08-13" && g.period === "day",
    );

    expect(groupAsc?.coverageStatus).toBe(groupDesc?.coverageStatus);
    expect(groupAsc?.missingIntervals).toEqual(groupDesc?.missingIntervals);
    // Full: technician A covers 07:30-12:00, technician B (no override) covers the whole day -- combined, full.
    expect(groupAsc?.coverageStatus).toBe("full");
  });

  it("reports partial coverage (not full) when the supervisor role has a real gap, regardless of technician full coverage", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", role: "technician", period: "day" }),
      event({
        personId: EITAN.id,
        personName: EITAN.name,
        date: "2026-08-13",
        role: "supervisor",
        period: "day",
        endTimeOverride: "12:00",
        sourceCell: nextCell(),
      }),
    ];
    const model = buildModel({ events });
    const group = model.coverageOverview.find((g) => g.date === "2026-08-13" && g.period === "day");
    expect(group?.coverageStatus).toBe("partial");
    expect(group?.missingIntervals).toEqual([{ startMinute: 720, endMinute: 1170 }]); // 12:00-19:30
  });
});

describe("buildManagerOverviewReadModel — duties", () => {
  it("preserves duty Events across everyone, within range", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", category: "duty", role: null, period: "unspecified", dutyFamily: "guard", slot: 1, rawValue: "שומר 1", title: "שומר 1" }),
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-14", category: "duty", role: null, period: "unspecified", dutyFamily: "oxid", rawValue: "אוקסיד", title: "אוקסיד", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    expect(model.duties).toHaveLength(2);
    expect(model.duties.map((d) => d.dutyFamily).sort()).toEqual(["guard", "oxid"]);
  });

  it("filters duties to the selected range", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, date: "2026-08-13", category: "duty", role: null, dutyFamily: "guard" }),
      event({ personId: MARTIN.id, date: "2026-09-30", category: "duty", role: null, dutyFamily: "guard", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    expect(model.duties.every((d) => d.date === "2026-08-13")).toBe(true);
  });
});

describe("buildManagerOverviewReadModel — absences", () => {
  it("preserves absence Events across everyone, within range", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", category: "absence", role: null, period: "unspecified", absenceKind: "vacation", rawValue: "חופש", title: "חופש" }),
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-14", category: "absence", role: null, period: "unspecified", absenceKind: "medical", rawValue: "גימלים", title: "גימלים", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    expect(model.absences).toHaveLength(2);
    expect(model.absences.map((a) => a.absenceKind).sort()).toEqual(["medical", "vacation"]);
  });

  it("filters absences to the selected range", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, date: "2026-08-13", category: "absence", role: null, absenceKind: "vacation" }),
      event({ personId: MARTIN.id, date: "2026-09-30", category: "absence", role: null, absenceKind: "vacation", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    expect(model.absences.every((a) => a.date === "2026-08-13")).toBe(true);
  });
});

describe("buildManagerOverviewReadModel — potential vs internal", () => {
  it("reconciles allocations within range: no matching internal duty -> missing, and attaches the resolved source person's name + conflict", () => {
    const model = buildModel({
      events: [event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", category: "absence", role: null, absenceKind: "vacation" })],
      potentialAllocations: [allocation({ date: "2026-08-13", resolvedSourcePersonId: MARTIN.id })],
    });
    expect(model.potentialRequirements).toHaveLength(1);
    expect(model.potentialRequirements[0].status).toBe("missing");
    expect(model.potentialRequirements[0].resolvedSourcePersonName).toBe(MARTIN.name);
    expect(model.potentialRequirements[0].sourceConflict).toBe("blocking_absence");
  });

  it("a matching internal duty Event makes the requirement covered, with the actual performer attached", () => {
    const model = buildModel({
      events: [
        event({
          personId: EITAN.id,
          personName: EITAN.name,
          date: "2026-08-13",
          category: "duty",
          role: null,
          period: "unspecified",
          dutyFamily: "evacuation_on_call",
        }),
      ],
      potentialAllocations: [allocation({ date: "2026-08-13" })],
    });
    expect(model.potentialRequirements[0].status).toBe("covered");
    expect(model.potentialRequirements[0].actualAssignees).toEqual([
      { personId: EITAN.id, personName: EITAN.name, certainty: "confirmed" },
    ]);
  });

  it("filters potential requirements to the selected range", () => {
    const model = buildModel({
      potentialAllocations: [
        allocation({ date: "2026-08-13" }),
        allocation({ date: "2026-09-30", sourceCell: nextCell() }),
      ],
    });
    expect(model.potentialRequirements.every((r) => r.date === "2026-08-13")).toBe(true);
  });

  it("a range spanning both Potential halves (H1/H2) never collides on shared A1 cell references", () => {
    const spanningRange = {
      key: "30d" as const,
      startDate: "2026-06-15",
      endDate: "2026-07-15",
      dates: ["2026-06-15", "2026-07-15"],
      month: null,
    };
    const h1Allocation = allocation({
      sourceSheet: 'פוטנציאל תקש"אס 1-6/2026',
      sourceCell: "C2",
      date: "2026-06-15",
      dutyFamily: "guard",
      slot: 1,
      columnLabel: "שומר 1",
      sourceAllocationLabel: 'תקש"ל',
      resolvedSourcePersonId: null,
    });
    const h2Allocation = allocation({
      sourceSheet: 'פוטנציאל תקש"אס 7-12/2026',
      sourceCell: "C2",
      date: "2026-07-15",
      dutyFamily: "reserve",
      slot: 1,
      sourceSlot: 1,
      columnLabel: "עתודה 1",
      sourceAllocationLabel: 'תקש"ל',
      resolvedSourcePersonId: null,
    });

    const model = buildModel({
      range: spanningRange,
      potentialAllocations: [h1Allocation, h2Allocation],
      events: [
        event({
          personId: MARTIN.id,
          personName: MARTIN.name,
          date: "2026-06-15",
          category: "duty",
          role: null,
          period: "unspecified",
          dutyFamily: "guard",
          slot: 1,
        }),
      ],
    });

    expect(model.potentialRequirements).toHaveLength(2);
    const h1Result = model.potentialRequirements.find((r) => r.date === "2026-06-15")!;
    const h2Result = model.potentialRequirements.find((r) => r.date === "2026-07-15")!;

    expect(h1Result.columnLabel).toBe("שומר 1");
    expect(h1Result.status).toBe("covered");
    expect(h2Result.columnLabel).toBe("עתודה 1");
    expect(h2Result.status).toBe("missing");
  });

  it("an organizational label never resolves a source person name, but still reconciles structurally", () => {
    const model = buildModel({
      events: [
        event({
          personId: EITAN.id,
          personName: EITAN.name,
          date: "2026-08-13",
          category: "duty",
          role: null,
          period: "unspecified",
          dutyFamily: "evacuation_on_call",
        }),
      ],
      potentialAllocations: [
        allocation({ resolvedSourcePersonId: null, sourceAllocationLabel: 'תקש"ל', date: "2026-08-13" }),
      ],
    });
    expect(model.potentialRequirements[0].resolvedSourcePersonName).toBeNull();
    expect(model.potentialRequirements[0].status).toBe("covered");
  });
});

describe("buildManagerOverviewReadModel — selected person", () => {
  it("null when scope is everyone", () => {
    const model = buildModel({ selectedPersonId: null });
    expect(model.selectedPersonId).toBeNull();
    expect(model.selectedPerson).toBeNull();
  });

  it("builds the selected person's own full PersonalScheduleReadModel from the same in-memory snapshot", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", role: "technician", period: "day" }),
    ];
    const model = buildModel({ events, selectedPersonId: MARTIN.id });
    expect(model.selectedPersonId).toBe(MARTIN.id);
    expect(model.selectedPerson?.person.name).toBe(MARTIN.name);
    expect(model.selectedPerson?.currentAssignments.length).toBeGreaterThanOrEqual(0);
  });

  it("an invalid/unknown person id falls back safely to everyone -- never crashes", () => {
    const model = buildModel({ selectedPersonId: "p_does_not_exist" });
    expect(model.selectedPersonId).toBeNull();
    expect(model.selectedPerson).toBeNull();
  });

  it("a manager may select another manager", () => {
    const otherManager = person({ id: "p_other_manager", name: "מנהל אחר", isManager: true });
    const model = buildModel({ people: [MANAGER, otherManager], selectedPersonId: otherManager.id });
    expect(model.selectedPerson?.person.name).toBe(otherManager.name);
  });

  it("includes the selected person's own range-scoped absences", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", category: "absence", role: null, absenceKind: "vacation" }),
      event({ personId: NOA.id, personName: NOA.name, date: "2026-08-13", category: "absence", role: null, absenceKind: "vacation", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events, selectedPersonId: MARTIN.id });
    expect(model.selectedPersonRangeAbsences).toHaveLength(1);
    expect(model.selectedPersonRangeAbsences[0].personId).toBe(MARTIN.id);
  });

  it("selecting a person never changes the authenticated manager", () => {
    const model = buildModel({ selectedPersonId: MARTIN.id });
    expect(model.manager.id).toBe(MANAGER.id);
    expect(model.manager.name).toBe(MANAGER.name);
  });
});

describe("buildManagerOverviewReadModel — privacy", () => {
  it("never serializes sourceSheet/sourceCell anywhere in the model", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", category: "duty", role: null, dutyFamily: "guard" }),
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "absence", role: null, absenceKind: "vacation", sourceCell: nextCell() }),
    ];
    const model = buildModel({
      events,
      potentialAllocations: [allocation()],
      selectedPersonId: MARTIN.id,
    });
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain("sourceSheet");
    expect(serialized).not.toContain("sourceCell");
  });

  it("never serializes any email", () => {
    const withEmail = person({ id: "p_e", name: "עם מייל", email: "someone@example.invalid" });
    const model = buildModel({ people: [MANAGER, withEmail], selectedPersonId: withEmail.id });
    expect(JSON.stringify(model)).not.toContain("someone@example.invalid");
  });

  it("never serializes a raw spreadsheet ID or Google API object shape", () => {
    const model = buildModel();
    expect(JSON.stringify(model)).not.toMatch(/spreadsheetId|valueRanges/);
  });
});

describe("buildManagerOverviewReadModel — problemsOnly / range echo", () => {
  it("echoes the resolved range and problemsOnly flag", () => {
    const model = buildModel({ problemsOnly: true });
    expect(model.problemsOnly).toBe(true);
    expect(model.range.key).toBe("7d");
    expect(model.range.startDate).toBe("2026-08-13");
  });
});

describe("buildManagerOverviewReadModel — PR #16 manager Potential scope", () => {
  it("a mixed fixture: only the team alias + team person requirements appear, every external source is excluded", () => {
    const model = buildModel({
      potentialAllocations: [
        allocation({ sourceAllocationLabel: 'תקש"ל', dutyFamily: "evacuation_on_call", date: "2026-08-13" }),
        allocation({ sourceAllocationLabel: "מרטין", resolvedSourcePersonId: null, dutyFamily: "oxid", sourceSlot: 1, date: "2026-08-13" }),
        allocation({ sourceAllocationLabel: "איתן מרכז", resolvedSourcePersonId: null, dutyFamily: "rasar", sourceSlot: 1, date: "2026-08-13" }),
        allocation({ sourceAllocationLabel: "רוקם", resolvedSourcePersonId: null, dutyFamily: "daily_kitchen", sourceSlot: 1, date: "2026-08-13" }),
        allocation({ sourceAllocationLabel: "סייבר", resolvedSourcePersonId: null, dutyFamily: "full_kitchen", sourceSlot: 1, date: "2026-08-13" }),
        allocation({ sourceAllocationLabel: 'אמל"ח קצה', resolvedSourcePersonId: null, dutyFamily: "oxid", sourceSlot: 2, date: "2026-08-13" }),
        allocation({ sourceAllocationLabel: 'מ"א', resolvedSourcePersonId: null, dutyFamily: "rasar", sourceSlot: 2, date: "2026-08-13" }),
      ],
    });

    expect(model.potentialRequirements).toHaveLength(2);
    const labels = model.potentialRequirements.map((r) => r.sourceAllocationLabel).sort();
    expect(labels).toEqual(['מרטין', 'תקש"ל'].sort());
    expect(model.potentialRequirements.some((r) => r.sourceAllocationLabel === "איתן מרכז")).toBe(false);
    expect(model.potentialRequirements.some((r) => r.sourceAllocationLabel === "סייבר")).toBe(false);
  });

  it("mixed missing counts: 5 external missing + 1 team missing -> only 1 relevant missing requirement, never 6", () => {
    const externalLabels = ["איתן מרכז", "רוקם", "סייבר", "מבצעים", 'אמל"ח קצה'];
    const model = buildModel({
      potentialAllocations: [
        allocation({ sourceAllocationLabel: 'תקש"ל', dutyFamily: "evacuation_on_call", date: "2026-08-13" }),
        ...externalLabels.map((label, index) =>
          allocation({
            sourceAllocationLabel: label,
            resolvedSourcePersonId: null,
            dutyFamily: "oxid",
            sourceSlot: index + 1,
            date: "2026-08-13",
          }),
        ),
      ],
    });

    const missing = model.potentialRequirements.filter((r) => r.status === "missing");
    expect(missing).toHaveLength(1);
    expect(missing[0].sourceAllocationLabel).toBe('תקש"ל');
  });

  it("problemsOnly=1: an external missing requirement never contributes a problem -- it was excluded before reconciliation, regardless of mode", () => {
    const model = buildModel({
      problemsOnly: true,
      potentialAllocations: [
        allocation({ sourceAllocationLabel: 'תקש"ל', dutyFamily: "evacuation_on_call", date: "2026-08-13" }),
        allocation({
          sourceAllocationLabel: "איתן מרכז",
          resolvedSourcePersonId: null,
          dutyFamily: "oxid",
          sourceSlot: 1,
          date: "2026-08-13",
        }),
      ],
      events: [
        event({
          personId: MARTIN.id,
          personName: MARTIN.name,
          date: "2026-08-13",
          category: "duty",
          role: null,
          period: "unspecified",
          dutyFamily: "evacuation_on_call",
        }),
      ],
    });

    expect(model.potentialRequirements).toHaveLength(1);
    expect(model.potentialRequirements[0].status).toBe("covered");
    expect(model.potentialRequirements.some((r) => r.status === "missing")).toBe(false);
  });

  it("sourceConflict still works for a team-owned, exact-name-resolved source after scope filtering", () => {
    const model = buildModel({
      potentialAllocations: [
        allocation({
          sourceAllocationLabel: MARTIN.name,
          resolvedSourcePersonId: MARTIN.id,
          dutyFamily: "evacuation_on_call",
          date: "2026-08-13",
        }),
      ],
      events: [
        event({
          personId: MARTIN.id,
          personName: MARTIN.name,
          date: "2026-08-13",
          category: "absence",
          role: null,
          period: "unspecified",
          absenceKind: "vacation",
        }),
      ],
    });

    expect(model.potentialRequirements).toHaveLength(1);
    expect(model.potentialRequirements[0].sourceConflict).toBe("blocking_absence");
  });

  it("an ambiguous short first name (two roster members sharing it) is excluded, not guessed", () => {
    const dup1 = person({ id: "p_d1", name: "דניאל א" });
    const dup2 = person({ id: "p_d2", name: "דניאל ב" });
    const model = buildModel({
      people: [MANAGER, MARTIN, EITAN, NOA, dup1, dup2],
      potentialAllocations: [
        allocation({ sourceAllocationLabel: "דניאל", resolvedSourcePersonId: null, dutyFamily: "evacuation_on_call", date: "2026-08-13" }),
      ],
    });
    expect(model.potentialRequirements).toHaveLength(0);
  });

  it("does not affect internal roster/schedule/duties/absences/coverage/issues -- only Potential requirements are scoped", () => {
    const model = buildModel({
      events: [
        event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "duty", role: null, period: "unspecified", dutyFamily: "oxid" }),
      ],
      potentialAllocations: [
        allocation({ sourceAllocationLabel: "סייבר", resolvedSourcePersonId: null, dutyFamily: "oxid", sourceSlot: 1, date: "2026-08-13" }),
      ],
    });
    expect(model.potentialRequirements).toHaveLength(0);
    expect(model.duties.some((d) => d.personId === EITAN.id)).toBe(true);
    expect(model.roster).toHaveLength(4);
  });
});
