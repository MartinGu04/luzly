import { describe, expect, it } from "vitest";
import { resolveManagerDateRange } from "@/lib/domain/dateRange";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import type { PotentialAllocation } from "@/lib/domain/potentialAllocation";
import type { ReserveRoleParticipationSource } from "@/lib/domain/reserveParticipation";
import { buildManagerOverviewReadModel } from "./buildManagerOverviewReadModel";

/** A `ReserveRoleParticipationSource` tagged with the (real or `null`) year its source sheet represents -- the shape `managerOverview.ts` now builds via `parseSourcePeriodYear`. */
function reserveSource(
  year: number | null,
  overrides: { technicianIds?: string[]; supervisorIds?: string[] } = {},
): ReserveRoleParticipationSource {
  return {
    year,
    participation: {
      technicianPersonIds: new Set(overrides.technicianIds ?? []),
      supervisorPersonIds: new Set(overrides.supervisorIds ?? []),
    },
  };
}

const EMPTY_SOURCE = reserveSource(null);

// day 07:30-19:30, night 19:30-07:30(+1)
const schedule = buildShiftSchedule("07:30");
const now: LocalNow = { date: "2026-08-13", minuteOfDay: 600 };

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

// Default personnelType is "חובה" (regular/mandatory service, PR #39) so
// every existing fixture person is automatically eligible for shift-
// coverage recommendations without needing Fairness/shift participation
// evidence -- the same normal-pool status these fixtures always implicitly
// represented, now made explicit. Tests that specifically exercise
// permanent/reserve/unclassified participation override this.
function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_x",
    name: "שם",
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: "חובה",
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
    reserveParticipationByPeriod: { h1: EMPTY_SOURCE, h2: EMPTY_SOURCE },
    shiftSchedule: schedule,
    fetchedAt: "2026-08-13T08:00:00.000Z",
    now,
    range: range7d(),
    selectedPersonId: null,
    managerAvatarUrl: null,
    adoption: { status: "skipped" },
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

describe("buildManagerOverviewReadModel — coverage recommendation (PR #37)", () => {
  it("a missing-technician issue carries a recommendation with the eligible technician's resolved name", () => {
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "shift", role: "supervisor", period: "day" }),
    ];
    // NOA (technician, no conflicting Events) is the only other technician in scope.
    const model = buildModel({ events, people: [MANAGER, EITAN, NOA] });
    const issue = model.issues.find((i) => i.reason === "shift_coverage_missing")!;
    expect(issue).toBeDefined();
    expect(issue.recommendation).not.toBeNull();
    expect(issue.recommendation?.missingRole).toBe("technician");
    expect(issue.recommendation?.primaryCandidates).toEqual([{ personId: NOA.id, personName: NOA.name }]);
    expect(issue.recommendation?.fallbackCandidates).toEqual([]);
  });

  it("a non-coverage issue (blocking absence) never carries a recommendation", () => {
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "absence", role: null, period: "unspecified", absenceKind: "vacation", rawValue: "חופש", title: "חופש" }),
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "shift", role: "supervisor", sourceCell: nextCell() }),
    ];
    const model = buildModel({ events });
    const issue = model.issues.find((i) => i.reason === "blocking_absence_with_assignment")!;
    expect(issue).toBeDefined();
    expect(issue.recommendation).toBeNull();
  });

  it("zero eligible candidates -> recommendation is null, never a fabricated empty list", () => {
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "shift", role: "supervisor", period: "day" }),
      // The only other technician (NOA) is on a blocking absence the same date.
      event({
        personId: NOA.id,
        personName: NOA.name,
        date: "2026-08-13",
        category: "absence",
        role: null,
        period: "unspecified",
        absenceKind: "vacation",
        rawValue: "חופש",
        title: "חופש",
        sourceCell: nextCell(),
      }),
    ];
    const model = buildModel({ events, people: [MANAGER, EITAN, NOA] });
    const issue = model.issues.find((i) => i.reason === "shift_coverage_missing")!;
    expect(issue).toBeDefined();
    expect(issue.recommendation).toBeNull();
  });

  it("recommendation candidates are a safe {personId, personName} projection only", () => {
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "shift", role: "supervisor", period: "day" }),
    ];
    const model = buildModel({ events });
    const issue = model.issues.find((i) => i.reason === "shift_coverage_missing")!;
    const [candidate] = issue.recommendation?.primaryCandidates ?? [];
    expect(candidate && Object.keys(candidate).sort()).toEqual(["personId", "personName"]);
  });
});

describe("buildManagerOverviewReadModel — PR #39 reserve participation wired end-to-end", () => {
  const RESERVE_TECH = person({ id: "p_reserve_tech", name: "מילואים טכנאי", personnelType: "מילואים", isTechnician: true });

  /** A one-date range anchored on `date` -- bypasses `resolveManagerDateRange`'s "now"-relative resolution so a fixed H1 (Jan-Jun) or H2 (Jul-Dec) date, in any year, can be exercised regardless of this file's shared `now`. */
  function singleDateRange(date: string) {
    return { key: "today" as const, startDate: date, endDate: date, dates: [date], month: null };
  }

  it("a reservist with technician Fairness evidence ONLY in H1 2026 is recommended for an H1 2026 issue", () => {
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-02-10", category: "shift", role: "supervisor", period: "day" }),
    ];
    const model = buildModel({
      events,
      people: [MANAGER, EITAN, RESERVE_TECH],
      range: singleDateRange("2026-02-10"),
      reserveParticipationByPeriod: {
        h1: reserveSource(2026, { technicianIds: [RESERVE_TECH.id] }),
        h2: EMPTY_SOURCE,
      },
    });
    const issue = model.issues.find((i) => i.reason === "shift_coverage_missing")!;
    expect(issue).toBeDefined();
    expect(issue.recommendation?.primaryCandidates).toEqual([{ personId: RESERVE_TECH.id, personName: RESERVE_TECH.name }]);
  });

  it("the SAME reservist (H1 2026 evidence) is recommended for an H2 2026 issue when the H2 source ALSO carries their evidence -- proving H2 is genuinely used, not just H1 suppressed", () => {
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-09-10", category: "shift", role: "supervisor", period: "day" }),
    ];
    const model = buildModel({
      events,
      people: [MANAGER, EITAN, RESERVE_TECH],
      range: singleDateRange("2026-09-10"),
      reserveParticipationByPeriod: {
        h1: EMPTY_SOURCE,
        h2: reserveSource(2026, { technicianIds: [RESERVE_TECH.id] }),
      },
    });
    const issue = model.issues.find((i) => i.reason === "shift_coverage_missing")!;
    expect(issue).toBeDefined();
    expect(issue.recommendation?.primaryCandidates).toEqual([{ personId: RESERVE_TECH.id, personName: RESERVE_TECH.name }]);
  });

  it("the SAME reservist (H1 2026-only evidence) is NOT recommended for an H2 2026 issue -- the HALF is resolved per issue date", () => {
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-09-10", category: "shift", role: "supervisor", period: "day" }),
    ];
    const model = buildModel({
      events,
      people: [MANAGER, EITAN, RESERVE_TECH],
      range: singleDateRange("2026-09-10"),
      reserveParticipationByPeriod: {
        h1: reserveSource(2026, { technicianIds: [RESERVE_TECH.id] }),
        h2: EMPTY_SOURCE,
      },
    });
    const issue = model.issues.find((i) => i.reason === "shift_coverage_missing")!;
    expect(issue).toBeDefined();
    expect(issue.recommendation).toBeNull();
  });

  it("year-safety: an H1 2027 issue does NOT inherit H1 2026 Fairness evidence, even though both resolve to the same half ('h1')", () => {
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, date: "2027-02-10", category: "shift", role: "supervisor", period: "day" }),
    ];
    const model = buildModel({
      events,
      people: [MANAGER, EITAN, RESERVE_TECH],
      range: singleDateRange("2027-02-10"),
      reserveParticipationByPeriod: {
        // Only H1-2026 evidence exists (the currently configured source sheet) -- no H1-2027 source exists at all.
        h1: reserveSource(2026, { technicianIds: [RESERVE_TECH.id] }),
        h2: EMPTY_SOURCE,
      },
    });
    const issue = model.issues.find((i) => i.reason === "shift_coverage_missing")!;
    expect(issue).toBeDefined();
    expect(issue.recommendation).toBeNull();
  });

  it("year-safety: a 2027 reservist may still qualify through a valid recent same-role shift, independent of the (year-mismatched) Fairness evidence", () => {
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, date: "2027-02-10", category: "shift", role: "supervisor", period: "day" }),
      // A confirmed technician shift 5 days before the issue -- inside the recent-shift evidence window.
      event({ personId: RESERVE_TECH.id, personName: RESERVE_TECH.name, date: "2027-02-05", category: "shift", role: "technician", period: "day", certainty: "confirmed" }),
    ];
    const model = buildModel({
      events,
      people: [MANAGER, EITAN, RESERVE_TECH],
      range: singleDateRange("2027-02-10"),
      reserveParticipationByPeriod: {
        h1: reserveSource(2026, {}), // year-mismatched, and carries no evidence for RESERVE_TECH anyway
        h2: EMPTY_SOURCE,
      },
    });
    const issue = model.issues.find((i) => i.reason === "shift_coverage_missing")!;
    expect(issue).toBeDefined();
    expect(issue.recommendation?.primaryCandidates).toEqual([{ personId: RESERVE_TECH.id, personName: RESERVE_TECH.name }]);
  });

  it("a permanent person is excluded end-to-end through the full read model, even with capability and Fairness evidence", () => {
    const PERM_TECH = person({ id: "p_perm_tech", name: "קבוע טכנאי", personnelType: "קבע", isTechnician: true });
    const events: Event[] = [
      event({ personId: EITAN.id, personName: EITAN.name, date: "2026-08-13", category: "shift", role: "supervisor", period: "day" }),
    ];
    const model = buildModel({
      events,
      people: [MANAGER, EITAN, PERM_TECH],
      reserveParticipationByPeriod: {
        h1: EMPTY_SOURCE,
        h2: reserveSource(2026, { technicianIds: [PERM_TECH.id] }),
      },
    });
    const issue = model.issues.find((i) => i.reason === "shift_coverage_missing")!;
    expect(issue).toBeDefined();
    expect(issue.recommendation).toBeNull();
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
    // roleCoverage (Design Pass PR #21 §11/§12) -- same computed diagnostic carried through, not a second algorithm.
    expect(group?.roleCoverage.technician.status).toBe("full");
    expect(group?.roleCoverage.supervisor.status).toBe("full");
  });

  it("reports missing coverage when only one role is present -- roleCoverage names WHICH role is missing", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", role: "technician", period: "day" }),
    ];
    const model = buildModel({ events });
    const group = model.coverageOverview.find((g) => g.date === "2026-08-13" && g.period === "day");
    expect(group?.coverageStatus).toBe("missing");
    expect(group?.roleCoverage.technician.status).toBe("full");
    expect(group?.roleCoverage.supervisor.status).toBe("missing");
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
    expect(group?.roleCoverage.supervisor.status).toBe("partial");
    expect(group?.roleCoverage.supervisor.missingIntervals).toEqual([{ startMinute: 720, endMinute: 1170 }]);
    expect(group?.roleCoverage.technician.status).toBe("full");
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

  it("includes a תקשא\"ס-only duty (no matching internal Event) for a person with none at all", () => {
    const model = buildModel({
      events: [],
      potentialAllocations: [allocation({ date: "2026-08-13", dutyFamily: "guard", slot: 1 })],
    });
    expect(model.duties).toEqual([
      expect.objectContaining({ personId: MARTIN.id, date: "2026-08-13", dutyFamily: "guard", slot: 1 }),
    ]);
  });

  it("still respects the Manager Area's selected time range -- an out-of-range תקשא\"ס allocation never appears", () => {
    const model = buildModel({
      events: [],
      potentialAllocations: [allocation({ date: "2026-09-30", dutyFamily: "guard", slot: 1 })],
    });
    expect(model.duties).toEqual([]);
  });

  it("a normal department person's duty is unaffected -- no duplicate from an overlapping allocation covering the same slot", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-13", category: "duty", role: null, dutyFamily: "guard", slot: 1 }),
    ];
    const model = buildModel({
      events,
      potentialAllocations: [allocation({ date: "2026-08-13", dutyFamily: "guard", slot: 1 })],
    });
    expect(model.duties).toHaveLength(1);
  });

  it("ambiguous source ownership (two personnel sharing a leading token) is never attributed to either -- no guess", () => {
    const martinTwin = person({ id: "p_martin_twin", name: "מרטין אחר" });
    const model = buildModel({
      people: [MANAGER, MARTIN, martinTwin, EITAN, NOA],
      events: [],
      potentialAllocations: [allocation({ date: "2026-08-13", dutyFamily: "guard", slot: 1, sourceAllocationLabel: "מרטין" })],
    });
    expect(model.duties).toEqual([]);
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

describe("buildManagerOverviewReadModel — selected person's תקשא\"ס-only allocation is NEVER shown as an actual personal assignment", () => {
  it("a person with a תקשא\"ס-only allocation (no matching internal Event) shows NOTHING in their upcoming assignments -- Potential is source/planning data, never presented as an actual assignment", () => {
    const model = buildModel({
      events: [],
      potentialAllocations: [allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 1 })],
      selectedPersonId: MARTIN.id,
      now: { date: "2026-08-13", minuteOfDay: 600 },
    });
    expect(model.selectedPerson?.nextAssignmentGroup).toBeNull();
    expect(model.selectedPerson?.dutyBlocks).toEqual([]);
  });

  it("a duty family mismatch on the same date (real daily_kitchen vs. Potential full_kitchen) never adds a second pseudo-duty for the selected person", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-20", category: "duty", role: null, dutyFamily: "daily_kitchen", slot: null, title: "מטבח יומי" }),
    ];
    const model = buildModel({
      events,
      potentialAllocations: [
        allocation({ date: "2026-08-20", dutyFamily: "full_kitchen", slot: 3, sourceSlot: 3, columnLabel: "מטבח מלא 3", sourceAllocationLabel: MARTIN.name }),
      ],
      selectedPersonId: MARTIN.id,
      now: { date: "2026-08-13", minuteOfDay: 600 },
    });
    const duties = model.selectedPerson?.calendarEvents.filter((e) => e.category === "duty") ?? [];
    expect(duties).toEqual([expect.objectContaining({ dutyFamily: "daily_kitchen", title: "מטבח יומי" })]);
  });

  it("a normal department person's existing assignments are unaffected -- no duplicate from an overlapping allocation", () => {
    const events: Event[] = [
      event({ personId: MARTIN.id, personName: MARTIN.name, date: "2026-08-20", category: "duty", role: null, dutyFamily: "guard", slot: 1 }),
    ];
    const model = buildModel({
      events,
      potentialAllocations: [allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 1 })],
      selectedPersonId: MARTIN.id,
      now: { date: "2026-08-13", minuteOfDay: 600 },
    });
    expect(model.selectedPerson?.nextAssignmentGroup?.events).toHaveLength(1);
  });

  it("adding a תקשא\"ס duty never makes the selected person a shift worker -- capability flags untouched", () => {
    const nonShiftPerson = person({ id: "p_nonshift", name: "אלון דוגמה", isTechnician: false, isSupervisor: false });
    const model = buildModel({
      people: [MANAGER, nonShiftPerson],
      events: [],
      potentialAllocations: [allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 1, sourceAllocationLabel: nonShiftPerson.name })],
      selectedPersonId: nonShiftPerson.id,
    });
    expect(model.selectedPerson?.person.isTechnician).toBe(false);
    expect(model.selectedPerson?.person.isSupervisor).toBe(false);
  });

  it("ambiguous source ownership is never attributed to the selected person either", () => {
    const martinTwin = person({ id: "p_martin_twin", name: "מרטין אחר" });
    const model = buildModel({
      people: [MANAGER, MARTIN, martinTwin, EITAN, NOA],
      events: [],
      potentialAllocations: [allocation({ date: "2026-08-20", dutyFamily: "guard", slot: 1, sourceAllocationLabel: "מרטין" })],
      selectedPersonId: MARTIN.id,
      now: { date: "2026-08-13", minuteOfDay: 600 },
    });
    expect(model.selectedPerson?.nextAssignmentGroup).toBeNull();
    expect(model.selectedPerson?.dutyBlocks).toEqual([]);
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

describe("buildManagerOverviewReadModel — range echo", () => {
  it("echoes the resolved range", () => {
    const model = buildModel();
    expect(model.range.key).toBe("7d");
    expect(model.range.startDate).toBe("2026-08-13");
  });

  it("echoes the manager's own avatarUrl, never anyone else's", () => {
    const model = buildModel({ managerAvatarUrl: "https://example.invalid/photo.jpg" });
    expect(model.manager.avatarUrl).toBe("https://example.invalid/photo.jpg");
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

  it("an external missing requirement never contributes a problem -- it was excluded before reconciliation", () => {
    const model = buildModel({
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

  it("sourceConflict works for a SHORT-NAME-resolved source too (PR #16 hardening §4) -- the label is the short name, not the full name", () => {
    const model = buildModel({
      potentialAllocations: [
        allocation({
          sourceAllocationLabel: "מרטין", // short first name only -- NOT MARTIN.name
          resolvedSourcePersonId: null, // as parsePotentialSheet would leave it (exact-name-only resolution)
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

    // The requirement remains included (short-name team-person ownership)...
    expect(model.potentialRequirements).toHaveLength(1);
    // ...AND the enriched resolvedSourcePersonId lets sourceConflict fire.
    expect(model.potentialRequirements[0].resolvedSourcePersonId).toBe(MARTIN.id);
    expect(model.potentialRequirements[0].sourceConflict).toBe("blocking_absence");
  });

  it("sourceConflict works for an ANNOTATED-NAME-resolved source too (PR #16 hardening §5)", () => {
    const mark = person({ id: "p_mark", name: "מארק ישראלי" });
    const model = buildModel({
      people: [MANAGER, MARTIN, EITAN, NOA, mark],
      potentialAllocations: [
        allocation({
          sourceAllocationLabel: "מארק - הוקפץ מא",
          resolvedSourcePersonId: null,
          dutyFamily: "evacuation_on_call",
          date: "2026-08-13",
        }),
      ],
      events: [
        event({
          personId: mark.id,
          personName: mark.name,
          date: "2026-08-13",
          category: "absence",
          role: null,
          period: "unspecified",
          absenceKind: "vacation",
        }),
      ],
    });

    expect(model.potentialRequirements).toHaveLength(1);
    expect(model.potentialRequirements[0].resolvedSourcePersonId).toBe(mark.id);
    expect(model.potentialRequirements[0].sourceConflict).toBe("blocking_absence");
  });

  it("a former team member (e.g. סטיבן) not present in current personnel stays excluded -- no special-casing, fails closed like any other unknown source", () => {
    const model = buildModel({
      // MANAGER/MARTIN/EITAN/NOA only -- סטיבן is deliberately absent from current personnel.
      potentialAllocations: [
        allocation({ sourceAllocationLabel: "סטיבן", resolvedSourcePersonId: null, dutyFamily: "evacuation_on_call", date: "2026-08-13" }),
      ],
    });
    expect(model.potentialRequirements).toHaveLength(0);
  });

  it("נדב/יובל are EXCLUDED from Manager Overview scope when absent from current personnel -- no special team_unresolved_person ownership anymore (Design Pass PR #21 §23-25)", () => {
    const model = buildModel({
      // MANAGER/MARTIN/EITAN/NOA only -- נדב and יובל are deliberately absent from current personnel.
      potentialAllocations: [
        allocation({ sourceAllocationLabel: "נדב", resolvedSourcePersonId: null, dutyFamily: "oxid", sourceSlot: 1, date: "2026-08-13" }),
        allocation({ sourceAllocationLabel: "יובל", resolvedSourcePersonId: null, dutyFamily: "oxid", sourceSlot: 2, date: "2026-08-13" }),
      ],
    });

    expect(model.potentialRequirements).toHaveLength(0);
  });

  it("נדב stays excluded when the label doesn't match at all (e.g. misspelled) -- only the exact canonical token is recognized, no fuzzy matching", () => {
    const model = buildModel({
      potentialAllocations: [
        allocation({ sourceAllocationLabel: "נדבים", resolvedSourcePersonId: null, dutyFamily: "evacuation_on_call", date: "2026-08-13" }),
      ],
    });
    expect(model.potentialRequirements).toHaveLength(0);
  });

  it("if נדב is later added to current personnel, he resolves as a normal team_person with a real resolvedSourcePersonId, and sourceConflict works again", () => {
    const nadav = person({ id: "p_nadav", name: "נדב פרידמן" });
    const model = buildModel({
      people: [MANAGER, MARTIN, EITAN, NOA, nadav],
      potentialAllocations: [
        allocation({ sourceAllocationLabel: "נדב", resolvedSourcePersonId: null, dutyFamily: "evacuation_on_call", date: "2026-08-13" }),
      ],
      events: [
        event({
          personId: nadav.id,
          personName: nadav.name,
          date: "2026-08-13",
          category: "absence",
          role: null,
          period: "unspecified",
          absenceKind: "vacation",
        }),
      ],
    });

    expect(model.potentialRequirements).toHaveLength(1);
    expect(model.potentialRequirements[0].resolvedSourcePersonId).toBe(nadav.id);
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

describe("buildManagerOverviewReadModel — adoption (התחברויות והתראות) projection", () => {
  it("status: skipped -- the caller never attempted the lookup (a person is selected)", () => {
    const model = buildModel({ adoption: { status: "skipped" } });
    expect(model.adoption).toEqual({ status: "skipped" });
  });

  it("status: unavailable -- the caller attempted the lookup and it failed, distinct from skipped", () => {
    const model = buildModel({ adoption: { status: "unavailable" } });
    expect(model.adoption).toEqual({ status: "unavailable" });
  });

  it("status: available -- every person survives (unlike the old blockers-only view), split into loginStatus/notificationStatus", () => {
    const model = buildModel({
      adoption: {
        status: "ok",
        results: [
          { personId: MANAGER.id, status: "ready", avatarUrl: "https://example.invalid/manager.jpg" },
          { personId: MARTIN.id, status: "no_push_subscription", avatarUrl: "https://example.invalid/martin.jpg" },
          { personId: EITAN.id, status: "ready", avatarUrl: null },
          { personId: NOA.id, status: "unmapped_account", avatarUrl: null },
        ],
      },
    });

    expect(model.adoption.status).toBe("available");
    if (model.adoption.status !== "available") return;
    expect(model.adoption.view.summary).toEqual({
      totalCount: 4,
      loggedInCount: 3,
      notLoggedInCount: 1,
      notificationReadyCount: 2,
      loggedInNotReadyCount: 1,
      dataIssueCount: 0,
    });
    expect(model.adoption.view.people).toHaveLength(4);

    const martin = model.adoption.view.people.find((p) => p.personId === MARTIN.id);
    expect(martin).toEqual({
      personId: MARTIN.id,
      personName: MARTIN.name,
      avatarUrl: "https://example.invalid/martin.jpg",
      loginStatus: "logged_in",
      notificationStatus: "not_enabled",
      dataIssue: null,
      needsNudge: true,
    });

    const noa = model.adoption.view.people.find((p) => p.personId === NOA.id);
    expect(noa).toEqual({
      personId: NOA.id,
      personName: NOA.name,
      avatarUrl: null,
      loginStatus: "not_logged_in",
      notificationStatus: null,
      dataIssue: null,
      needsNudge: true,
    });

    const manager = model.adoption.view.people.find((p) => p.personId === MANAGER.id);
    expect(manager).toEqual({
      personId: MANAGER.id,
      personName: MANAGER.name,
      avatarUrl: "https://example.invalid/manager.jpg",
      loginStatus: "logged_in",
      notificationStatus: "ready",
      dataIssue: null,
      needsNudge: false,
    });
  });

  it("missing/ambiguous email resolve to a dataIssue row -- null loginStatus/notificationStatus/avatarUrl, never needsNudge", () => {
    const model = buildModel({
      adoption: {
        status: "ok",
        results: [
          { personId: MARTIN.id, status: "missing_email", avatarUrl: null },
          { personId: EITAN.id, status: "ambiguous_email", avatarUrl: null },
        ],
      },
    });

    expect(model.adoption.status).toBe("available");
    if (model.adoption.status !== "available") return;
    expect(model.adoption.view.summary.dataIssueCount).toBe(2);

    const martin = model.adoption.view.people.find((p) => p.personId === MARTIN.id);
    expect(martin).toEqual({
      personId: MARTIN.id,
      personName: MARTIN.name,
      avatarUrl: null,
      loginStatus: null,
      notificationStatus: null,
      dataIssue: "missing_email",
      needsNudge: false,
    });
    const eitan = model.adoption.view.people.find((p) => p.personId === EITAN.id);
    expect(eitan?.dataIssue).toBe("ambiguous_email");
  });

  it("orders people by name then id, same tiebreak convention as the roster", () => {
    const bDup = person({ id: "p_b2", name: "ב", isTechnician: true });
    const aDup = person({ id: "p_a1", name: "א", isTechnician: true });
    const model = buildModel({
      people: [aDup, bDup],
      adoption: {
        status: "ok",
        results: [
          { personId: bDup.id, status: "no_push_subscription", avatarUrl: null },
          { personId: aDup.id, status: "no_push_subscription", avatarUrl: null },
        ],
      },
    });

    expect(model.adoption.status).toBe("available");
    if (model.adoption.status !== "available") return;
    expect(model.adoption.view.people.map((p) => p.personId)).toEqual([aDup.id, bDup.id]);
  });

  it("when everyone is ready, notLoggedInCount/loggedInNotReadyCount/dataIssueCount are all zero", () => {
    const model = buildModel({
      adoption: {
        status: "ok",
        results: [
          { personId: MANAGER.id, status: "ready", avatarUrl: null },
          { personId: MARTIN.id, status: "ready", avatarUrl: null },
        ],
      },
    });

    expect(model.adoption.status).toBe("available");
    if (model.adoption.status !== "available") return;
    expect(model.adoption.view.summary).toEqual({
      totalCount: 2,
      loggedInCount: 2,
      notLoggedInCount: 0,
      notificationReadyCount: 2,
      loggedInNotReadyCount: 0,
      dataIssueCount: 0,
    });
  });
});

describe("buildManagerOverviewReadModel — managerShiftSnapshot eligibility", () => {
  it("is null for a permanent/non-shift manager (no isTechnician/isSupervisor capability flags)", () => {
    const model = buildModel({ manager: MANAGER });
    expect(model.managerShiftSnapshot).toBeNull();
  });

  it("is populated for a shift-capable manager who is a technician", () => {
    const technicianManager = { ...MANAGER, isTechnician: true };
    const model = buildModel({ manager: technicianManager, people: [technicianManager, MARTIN, EITAN, NOA] });
    expect(model.managerShiftSnapshot).not.toBeNull();
  });

  it("is populated for a shift-capable manager who is a supervisor (e.g. an אחמ״ש with manager access)", () => {
    const supervisorManager = { ...MANAGER, isSupervisor: true };
    const model = buildModel({ manager: supervisorManager, people: [supervisorManager, MARTIN, EITAN, NOA] });
    expect(model.managerShiftSnapshot).not.toBeNull();
  });

  it("eligibility is never a title-string check -- a manager named with 'אחמ״ש' but lacking the capability flags is still ineligible", () => {
    const titledManager = { ...MANAGER, name: 'אחמ"ש דני' };
    const model = buildModel({ manager: titledManager, people: [titledManager, MARTIN, EITAN, NOA] });
    expect(model.managerShiftSnapshot).toBeNull();
  });

  it("when populated, reflects the actual department-wide current shift, not the manager's personal assignment", () => {
    const technicianManager = { ...MANAGER, id: "p_manager", isTechnician: true };
    // A different person (not the manager) staffs the current day shift.
    const events = [event({ personId: MARTIN.id, personName: MARTIN.name, date: now.date, role: "technician", period: "day" })];
    const model = buildModel({
      manager: technicianManager,
      people: [technicianManager, MARTIN, EITAN, NOA],
      events,
    });

    expect(model.managerShiftSnapshot).not.toBeNull();
    expect(model.managerShiftSnapshot?.currentShift.technicians.map((p) => p.personId)).toContain(MARTIN.id);
  });
});
