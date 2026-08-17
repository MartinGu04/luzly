import { describe, expect, it } from "vitest";
import type { Event } from "./event";
import {
  computeShiftFairnessForGroup,
  resolveFairnessShiftStatus,
  resolveShiftFairnessPeriodDates,
  resolveShiftFairnessPeriodStatus,
  SHIFT_FAIRNESS_BALANCED_TOLERANCE_SHIFTS,
  type ShiftFairnessGroupResult,
} from "./fairnessShiftEngine";
import type { LocalNow } from "./localNow";
import type { ReserveRoleParticipation } from "./reserveParticipation";
import type { Person } from "./types";

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
    personnelType: "חובה",
    ...overrides,
  };
}

function baseEvent(overrides: Partial<Event> & { personId: string; date: string }): Event {
  return {
    personName: "",
    title: "משמרת",
    rawValue: "משמרת",
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

function shiftEvent(overrides: Partial<Event> & { personId: string; date: string }): Event {
  return baseEvent(overrides);
}

function absenceEvent(overrides: Partial<Event> & { personId: string; date: string }): Event {
  return baseEvent({
    category: "absence",
    role: null,
    period: "unspecified",
    absenceKind: "vacation",
    title: "חופש",
    rawValue: "חופש",
    ...overrides,
  });
}

function constraintEvent(overrides: Partial<Event> & { personId: string; date: string }): Event {
  return baseEvent({
    category: "constraint",
    role: null,
    period: "unspecified",
    title: "אילוץ",
    rawValue: "אילוץ",
    ...overrides,
  });
}

function participationEvidence(overrides: { technicianIds?: string[]; supervisorIds?: string[] } = {}): ReserveRoleParticipation {
  return {
    technicianPersonIds: new Set(overrides.technicianIds ?? []),
    supervisorPersonIds: new Set(overrides.supervisorIds ?? []),
  };
}

function findPerson(result: ShiftFairnessGroupResult, personId: string) {
  const row = result.people.find((entry) => entry.personId === personId);
  if (!row) throw new Error(`no result row for ${personId}`);
  return row;
}

// ---------------------------------------------------------------------------
// Balanced tolerance
// ---------------------------------------------------------------------------

describe("resolveFairnessShiftStatus — balanced tolerance", () => {
  it("zero deviation is balanced", () => {
    expect(resolveFairnessShiftStatus(0)).toBe("balanced");
  });

  it("exactly at the tolerance boundary (±0.5) is still balanced -- inclusive", () => {
    expect(resolveFairnessShiftStatus(SHIFT_FAIRNESS_BALANCED_TOLERANCE_SHIFTS)).toBe("balanced");
    expect(resolveFairnessShiftStatus(-SHIFT_FAIRNESS_BALANCED_TOLERANCE_SHIFTS)).toBe("balanced");
  });

  it("just past the boundary flips to above/below", () => {
    expect(resolveFairnessShiftStatus(SHIFT_FAIRNESS_BALANCED_TOLERANCE_SHIFTS + 0.01)).toBe("above");
    expect(resolveFairnessShiftStatus(-SHIFT_FAIRNESS_BALANCED_TOLERANCE_SHIFTS - 0.01)).toBe("below");
  });

  it("a whole shift over/under is unambiguously above/below", () => {
    expect(resolveFairnessShiftStatus(1)).toBe("above");
    expect(resolveFairnessShiftStatus(-1)).toBe("below");
  });
});

// ---------------------------------------------------------------------------
// Time behavior
// ---------------------------------------------------------------------------

describe("resolveShiftFairnessPeriodDates — current month stops at today", () => {
  it("the current month returns only 1..today, never the future portion", () => {
    const now: LocalNow = { date: "2026-08-15", minuteOfDay: 600 };
    const dates = resolveShiftFairnessPeriodDates({ year: 2026, month: 8 }, now);
    expect(dates).toHaveLength(15);
    expect(dates[0]).toBe("2026-08-01");
    expect(dates[dates.length - 1]).toBe("2026-08-15");
  });

  it("a past month is returned in full", () => {
    const now: LocalNow = { date: "2026-08-15", minuteOfDay: 600 };
    const dates = resolveShiftFairnessPeriodDates({ year: 2026, month: 7 }, now);
    expect(dates).toHaveLength(31);
    expect(dates[dates.length - 1]).toBe("2026-07-31");
  });

  it("a wholly future month returns no evaluable dates at all", () => {
    const now: LocalNow = { date: "2026-08-15", minuteOfDay: 600 };
    const dates = resolveShiftFairnessPeriodDates({ year: 2026, month: 9 }, now);
    expect(dates).toEqual([]);
  });
});

describe("resolveShiftFairnessPeriodStatus", () => {
  const now: LocalNow = { date: "2026-08-15", minuteOfDay: 600 };

  it("a past month is closed", () => {
    expect(resolveShiftFairnessPeriodStatus({ year: 2026, month: 7 }, now)).toBe("closed");
  });

  it("the current month is still current", () => {
    expect(resolveShiftFairnessPeriodStatus({ year: 2026, month: 8 }, now)).toBe("current");
  });

  it("a future month is current (not yet closed), even with zero evaluable dates", () => {
    expect(resolveShiftFairnessPeriodStatus({ year: 2026, month: 9 }, now)).toBe("current");
  });
});

// ---------------------------------------------------------------------------
// Opportunity-based targets
// ---------------------------------------------------------------------------

describe("computeShiftFairnessForGroup — equal availability", () => {
  it("equal opportunities -> equal targets; deviation reflects the real imbalance in actual work", () => {
    const A = person({ id: "p_a", isTechnician: true });
    const B = person({ id: "p_b", isTechnician: true });
    const dates = ["2026-08-03", "2026-08-04"]; // Mon, Tue -- both weekdays

    const events: Event[] = [
      shiftEvent({ personId: A.id, date: "2026-08-03", period: "day" }),
      shiftEvent({ personId: A.id, date: "2026-08-03", period: "night" }),
      shiftEvent({ personId: A.id, date: "2026-08-04", period: "day" }),
      shiftEvent({ personId: B.id, date: "2026-08-04", period: "night" }),
    ];

    const result = computeShiftFairnessForGroup("technician", [A, B], events, dates);

    const a = findPerson(result, A.id);
    const b = findPerson(result, B.id);

    expect(a.opportunityCount).toBe(4);
    expect(b.opportunityCount).toBe(4);
    // totalActual = 4, split 50/50 by equal opportunity -> target 2 each.
    expect(a.target).toBe(2);
    expect(b.target).toBe(2);
    expect(a.actualShifts).toBe(3);
    expect(b.actualShifts).toBe(1);
    expect(a.status).toBe("above"); // 3 vs target 2, deviation 1
    expect(b.status).toBe("below"); // 1 vs target 2, deviation -1
  });
});

describe("computeShiftFairnessForGroup — unequal availability", () => {
  it("fewer genuine opportunities means a smaller fair share, even when raw actual work is higher", () => {
    const A = person({ id: "p_a", isTechnician: true });
    const B = person({ id: "p_b", isTechnician: true });
    const dates = ["2026-08-03", "2026-08-04", "2026-08-05"]; // 3 weekdays

    const events: Event[] = [
      // B is fully constrained (full-day) on 2 of the 3 dates -> only 1 date (2 opportunities) left.
      constraintEvent({ personId: B.id, date: "2026-08-03", period: "unspecified" }),
      constraintEvent({ personId: B.id, date: "2026-08-04", period: "unspecified" }),
      // Actual work: A does less than B despite having 3x the opportunities.
      shiftEvent({ personId: A.id, date: "2026-08-03", period: "day" }),
      shiftEvent({ personId: A.id, date: "2026-08-04", period: "day" }),
      shiftEvent({ personId: B.id, date: "2026-08-05", period: "day" }),
      shiftEvent({ personId: B.id, date: "2026-08-05", period: "night" }),
      shiftEvent({ personId: B.id, date: "2026-08-03", period: "day" }), // still counts as actual despite being on a constrained date -- actual work performed is a fact, opportunity is a separate question
    ];

    const result = computeShiftFairnessForGroup("technician", [A, B], events, dates);
    const a = findPerson(result, A.id);
    const b = findPerson(result, B.id);

    expect(a.opportunityCount).toBe(6); // 3 dates * 2 periods, fully available
    expect(b.opportunityCount).toBe(2); // only 2026-08-05, day+night

    expect(a.actualShifts).toBe(2);
    expect(b.actualShifts).toBe(3);

    // totalActual = 5, totalOpportunity = 8
    expect(a.target).toBeCloseTo(5 * (6 / 8), 10);
    expect(b.target).toBeCloseTo(5 * (2 / 8), 10);

    // A worked LESS than their larger fair share -> below; B worked MORE than their smaller fair share -> above.
    expect(a.status).toBe("below");
    expect(b.status).toBe("above");
  });
});

describe("computeShiftFairnessForGroup — day/night/full-day constraints", () => {
  const SOLO = person({ id: "p_solo", isTechnician: true });
  const date = "2026-08-10";

  it("a day-only constraint removes the day opportunity but keeps the night one", () => {
    const events: Event[] = [constraintEvent({ personId: SOLO.id, date, period: "day" })];
    const result = computeShiftFairnessForGroup("technician", [SOLO], events, [date]);
    expect(findPerson(result, SOLO.id).opportunityCount).toBe(1);
  });

  it("a night-only constraint removes the night opportunity but keeps the day one", () => {
    const events: Event[] = [constraintEvent({ personId: SOLO.id, date, period: "night" })];
    const result = computeShiftFairnessForGroup("technician", [SOLO], events, [date]);
    expect(findPerson(result, SOLO.id).opportunityCount).toBe(1);
  });

  it("a full-day constraint (bare אילוץ) removes both opportunities", () => {
    const events: Event[] = [constraintEvent({ personId: SOLO.id, date, period: "unspecified" })];
    const result = computeShiftFairnessForGroup("technician", [SOLO], events, [date]);
    expect(findPerson(result, SOLO.id).opportunityCount).toBe(0);
  });

  it("no constraint at all leaves both opportunities", () => {
    const result = computeShiftFairnessForGroup("technician", [SOLO], [], [date]);
    expect(findPerson(result, SOLO.id).opportunityCount).toBe(2);
  });
});

describe("computeShiftFairnessForGroup — blocking absence", () => {
  it("a blocking absence removes both opportunities that day", () => {
    const SOLO = person({ id: "p_solo", isTechnician: true });
    const date = "2026-08-10";
    const events: Event[] = [absenceEvent({ personId: SOLO.id, date, absenceKind: "medical" })];
    const result = computeShiftFairnessForGroup("technician", [SOLO], events, [date]);
    expect(findPerson(result, SOLO.id).opportunityCount).toBe(0);
  });

  it("a non-blocking absence kind (after) never removes an opportunity", () => {
    const SOLO = person({ id: "p_solo", isTechnician: true });
    const date = "2026-08-10";
    const events: Event[] = [absenceEvent({ personId: SOLO.id, date, absenceKind: "after" })];
    const result = computeShiftFairnessForGroup("technician", [SOLO], events, [date]);
    expect(findPerson(result, SOLO.id).opportunityCount).toBe(2);
  });
});

describe("computeShiftFairnessForGroup — reservist with bounded/evidence-based participation", () => {
  it("opportunities are bounded to the reservist's OWN evidence window, never the full period", () => {
    const RESERVIST = person({ id: "p_res", personnelType: "מילואים", isTechnician: true });
    const OTHER = person({ id: "p_other", isTechnician: true });
    const dates = [
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ]; // 10-date period

    const events: Event[] = [
      // Reservist evidence only spans 2026-08-05..2026-08-07 -- their real, bounded service window.
      shiftEvent({ personId: RESERVIST.id, date: "2026-08-05", period: "day" }),
      shiftEvent({ personId: RESERVIST.id, date: "2026-08-06", period: "day" }),
      shiftEvent({ personId: RESERVIST.id, date: "2026-08-07", period: "night" }),
    ];

    const result = computeShiftFairnessForGroup("technician", [RESERVIST, OTHER], events, dates);
    const reservistRow = findPerson(result, RESERVIST.id);

    // 3 dates within the evidenced window * 2 periods = 6, NEVER 10 dates * 2 = 20.
    expect(reservistRow.opportunityCount).toBe(6);
    expect(reservistRow.actualShifts).toBe(3);
    expect(reservistRow.dataCompleteness.reasons).toContain("participation_inferred");
  });

  it("a reservist with zero evidence gets zero opportunities -- capability alone is never enough", () => {
    const RESERVIST = person({ id: "p_res2", personnelType: "מילואים", isTechnician: true });
    const result = computeShiftFairnessForGroup("technician", [RESERVIST], [], ["2026-08-10"]);
    const row = findPerson(result, RESERVIST.id);
    expect(row.opportunityCount).toBe(0);
    expect(row.target).toBe(0);
  });

  it("a reservist qualifies via the period's own Fairness-table evidence too, bounded by their inferred window if any", () => {
    const RESERVIST = person({ id: "p_res3", personnelType: "מילואים", isSupervisor: true });
    const dates = ["2026-08-10", "2026-08-11"];
    // No shift Events at all, but the sheet's own Fairness-table evidence proves rotation participation.
    const evidence = participationEvidence({ supervisorIds: [RESERVIST.id] });
    const result = computeShiftFairnessForGroup("supervisor", [RESERVIST], [], dates, evidence);
    const row = findPerson(result, RESERVIST.id);
    // Eligible via Fairness-table evidence, but with zero Event evidence the
    // participation window itself is "unknown" -- so opportunities still
    // correctly stay at zero (eligibility and participation are separate
    // facts; both must hold for a genuine opportunity).
    expect(row.opportunityCount).toBe(0);
    expect(row.dataCompleteness.reasons).toContain("participation_unknown");
  });
});

describe("computeShiftFairnessForGroup — permanent/unclassified participants with real shift evidence", () => {
  it("a permanent (קבע) person with a confirmed shift in the period becomes a genuine opportunity holder", () => {
    const PERMANENT = person({ id: "p_perm", personnelType: "קבע", isSupervisor: true });
    const dates = ["2026-08-10", "2026-08-11"];
    const events: Event[] = [shiftEvent({ personId: PERMANENT.id, date: "2026-08-10", role: "supervisor" })];
    const result = computeShiftFairnessForGroup("supervisor", [PERMANENT], events, dates, undefined);
    const row = findPerson(result, PERMANENT.id);
    // Eligible via evidence, and participation is "full_period" (permanent's
    // existing assumption) -- so opportunities span the WHOLE period, not
    // just the evidenced date.
    expect(row.opportunityCount).toBe(4); // 2 dates * 2 periods
    expect(row.actualShifts).toBe(1);
  });

  it("a permanent person with zero evidence gets zero opportunities -- never automatically excluded, never automatically included", () => {
    const PERMANENT = person({ id: "p_perm2", personnelType: "קבע", isSupervisor: true });
    const result = computeShiftFairnessForGroup("supervisor", [PERMANENT], [], ["2026-08-10"]);
    expect(findPerson(result, PERMANENT.id).opportunityCount).toBe(0);
  });

  it("an unclassified personnelType person with a confirmed shift in the period also becomes a genuine opportunity holder", () => {
    const UNCLASSIFIED = person({ id: "p_unk", personnelType: "משהו לא מוכר", isTechnician: true });
    const dates = ["2026-08-10", "2026-08-11"];
    const events: Event[] = [shiftEvent({ personId: UNCLASSIFIED.id, date: "2026-08-10" })];
    const result = computeShiftFairnessForGroup("technician", [UNCLASSIFIED], events, dates);
    const row = findPerson(result, UNCLASSIFIED.id);
    expect(row.opportunityCount).toBeGreaterThan(0);
    expect(row.actualShifts).toBe(1);
  });
});

describe("computeShiftFairnessForGroup — person not eligible for the role", () => {
  it("an ineligible group member gets zero target/opportunity and never dilutes eligible members' share", () => {
    const ELIGIBLE = person({ id: "p_eligible", isSupervisor: true }); // חובה default -- eligible once capable
    const INELIGIBLE = person({ id: "p_ineligible", personnelType: "קבע", isSupervisor: true }); // capable, but zero evidence
    const dates = ["2026-08-10", "2026-08-11"];

    const events: Event[] = [
      shiftEvent({ personId: ELIGIBLE.id, date: "2026-08-10", role: "supervisor" }),
      shiftEvent({ personId: ELIGIBLE.id, date: "2026-08-10", role: "supervisor", period: "night" }),
      shiftEvent({ personId: ELIGIBLE.id, date: "2026-08-11", role: "supervisor" }),
      shiftEvent({ personId: ELIGIBLE.id, date: "2026-08-11", role: "supervisor", period: "night" }),
    ];

    const result = computeShiftFairnessForGroup("supervisor", [ELIGIBLE, INELIGIBLE], events, dates);
    const eligibleRow = findPerson(result, ELIGIBLE.id);
    const ineligibleRow = findPerson(result, INELIGIBLE.id);

    expect(ineligibleRow.opportunityCount).toBe(0);
    expect(ineligibleRow.target).toBe(0);
    // The eligible person receives the FULL share -- not diluted by the ineligible member's capability flag.
    expect(eligibleRow.opportunityCount).toBe(4);
    expect(eligibleRow.target).toBe(4);
    expect(eligibleRow.status).toBe("balanced");
  });
});

describe("computeShiftFairnessForGroup — weekend imbalance despite balanced total shifts", () => {
  it("equal general status can still hide an unequal weekend distribution", () => {
    const A = person({ id: "p_a", isTechnician: true });
    const B = person({ id: "p_b", isTechnician: true });
    // 2026-08-13/14 = Thu/Fri (weekend), 2026-08-17/18 = Mon/Tue (weekday).
    const dates = ["2026-08-13", "2026-08-14", "2026-08-17", "2026-08-18"];

    const events: Event[] = [
      // A works only the weekend dates; B works only the weekday dates. Both do exactly 2 shifts overall.
      shiftEvent({ personId: A.id, date: "2026-08-13", period: "day" }),
      shiftEvent({ personId: A.id, date: "2026-08-14", period: "day" }),
      shiftEvent({ personId: B.id, date: "2026-08-17", period: "day" }),
      shiftEvent({ personId: B.id, date: "2026-08-18", period: "day" }),
    ];

    const result = computeShiftFairnessForGroup("technician", [A, B], events, dates);
    const a = findPerson(result, A.id);
    const b = findPerson(result, B.id);

    // Equal opportunities (8 each) and equal total actual (2 each) -> both balanced overall.
    expect(a.actualShifts).toBe(2);
    expect(b.actualShifts).toBe(2);
    expect(a.status).toBe("balanced");
    expect(b.status).toBe("balanced");

    // But the weekend split is completely skewed to A.
    expect(a.weekendActualShifts).toBe(2);
    expect(b.weekendActualShifts).toBe(0);
    expect(a.weekendTarget).toBe(1); // totalWeekendActual=2, equal weekend opportunities (4 each) -> 1 each
    expect(b.weekendTarget).toBe(1);
    expect(a.weekendStatus).toBe("above");
    expect(b.weekendStatus).toBe("below");
  });
});

describe("computeShiftFairnessForGroup — partial/incomplete data propagation", () => {
  it("regular/permanent participation is always flagged as assumed, never presented as verified", () => {
    const REGULAR = person({ id: "p_reg", isTechnician: true });
    const result = computeShiftFairnessForGroup("technician", [REGULAR], [], ["2026-08-10"]);
    expect(findPerson(result, REGULAR.id).dataCompleteness.reasons).toContain("participation_assumed_full_period");
  });

  it("eligibility is always flagged as undated (current snapshot only)", () => {
    const REGULAR = person({ id: "p_reg2", isTechnician: true });
    const result = computeShiftFairnessForGroup("technician", [REGULAR], [], ["2026-08-10"]);
    expect(findPerson(result, REGULAR.id).dataCompleteness.reasons).toContain("eligibility_undated");
  });

  it("an unmodeled (morning) constraint is never silently treated as verified availability", () => {
    const SOLO = person({ id: "p_solo", isTechnician: true });
    const date = "2026-08-10";
    const events: Event[] = [constraintEvent({ personId: SOLO.id, date, period: "morning" })];
    const result = computeShiftFairnessForGroup("technician", [SOLO], events, [date]);
    const row = findPerson(result, SOLO.id);
    // Neither day nor night is counted as an opportunity -- an unmodeled
    // constraint is never silently assumed available (nor silently assumed
    // blocked); it's excluded and flagged, never guessed either way.
    expect(row.opportunityCount).toBe(0);
    expect(row.dataCompleteness.reasons).toContain("constraint_period_unmodeled");
  });

  it("zero opportunities with zero actual work is nothing to distribute -- NOT flagged incomplete", () => {
    const PERMANENT = person({ id: "p_perm", personnelType: "קבע", isSupervisor: true }); // zero evidence -> zero opportunities, zero actual
    const result = computeShiftFairnessForGroup("supervisor", [PERMANENT], [], ["2026-08-10"]);
    const row = findPerson(result, PERMANENT.id);
    expect(row.actualShifts).toBe(0);
    expect(row.dataCompleteness.reasons).not.toContain("shift_target_no_group_opportunities");
  });

  it("an empty period (a wholly future month) never crashes and is trivially complete -- nothing happened, nothing to distribute", () => {
    const SOLO = person({ id: "p_solo", isTechnician: true });
    const result = computeShiftFairnessForGroup("technician", [SOLO], [], []);
    const row = findPerson(result, SOLO.id);
    expect(row.actualShifts).toBe(0);
    expect(row.target).toBe(0);
    expect(row.status).toBe("balanced");
    expect(row.dataCompleteness).toEqual({ status: "complete", reasons: [] });
  });

  it("real actual work with zero opportunities to explain it IS a genuinely unallocatable workload -- flagged incomplete", () => {
    // A person whose current capability flag no longer matches a real
    // confirmed shift they evidently worked -- see the group-membership
    // regression tests below for why this person still gets a row at all.
    const NO_LONGER_FLAGGED = person({ id: "p_reclassified", isTechnician: false, isSupervisor: false });
    const date = "2026-08-10";
    const events: Event[] = [shiftEvent({ personId: NO_LONGER_FLAGGED.id, date, role: "technician" })];
    const result = computeShiftFairnessForGroup("technician", [NO_LONGER_FLAGGED], events, [date]);
    const row = findPerson(result, NO_LONGER_FLAGGED.id);
    expect(row.actualShifts).toBe(1);
    expect(row.opportunityCount).toBe(0);
    expect(row.dataCompleteness.reasons).toContain("shift_target_no_group_opportunities");
  });
});

describe("computeShiftFairnessForGroup — group membership preserves real evidence despite a changed capability flag", () => {
  it("a person no longer flagged capable for the role still appears, with their real confirmed shifts counted as actual", () => {
    const NO_LONGER_FLAGGED = person({ id: "p_reclassified", isTechnician: false, isSupervisor: false });
    const dates = ["2026-08-10", "2026-08-11"];
    const events: Event[] = [
      shiftEvent({ personId: NO_LONGER_FLAGGED.id, date: "2026-08-10", role: "technician" }),
      shiftEvent({ personId: NO_LONGER_FLAGGED.id, date: "2026-08-11", role: "technician", period: "night" }),
    ];

    const result = computeShiftFairnessForGroup("technician", [NO_LONGER_FLAGGED], events, dates);

    // Without the fix, this person would have no row at all -- their real,
    // confirmed work would simply be invisible in the technician group.
    expect(result.people).toHaveLength(1);
    const row = findPerson(result, NO_LONGER_FLAGGED.id);
    expect(row.actualShifts).toBe(2);
    // Never granted a forward-looking opportunity share on the strength of
    // stale evidence -- opportunity still requires the CURRENT capability
    // flag, unaffected by this fix.
    expect(row.opportunityCount).toBe(0);
    expect(row.target).toBe(0);
  });

  it("an evidence-only member's real shifts still count toward the group's total actual workload -- documented, deliberate consequence of preserving visibility", () => {
    // This is the one honest side effect of the fix: the group's
    // "totalActual" (the real workload the opportunity-share formula
    // redistributes) is a simple sum across every VISIBLE member, evidence-
    // only ones included -- their own real work is part of the group's real
    // total, exactly as it should be. Because they hold zero opportunities,
    // none of that total actually redistributes back to them (their own
    // target stays 0) -- it flows entirely onto the currently-eligible
    // opportunity holder(s) instead. The formula itself is intentionally
    // UNCHANGED (see this PR's own note) -- this test exists to make the
    // real, if narrow, consequence explicit and regression-tested rather
    // than silently relying on it.
    const NO_LONGER_FLAGGED = person({ id: "p_reclassified", isTechnician: false, isSupervisor: false });
    const CURRENT = person({ id: "p_current", isTechnician: true });
    const date = "2026-08-10";
    const events: Event[] = [
      shiftEvent({ personId: NO_LONGER_FLAGGED.id, date, role: "technician" }),
      shiftEvent({ personId: CURRENT.id, date, role: "technician", period: "night" }),
    ];

    const result = computeShiftFairnessForGroup("technician", [NO_LONGER_FLAGGED, CURRENT], events, [date]);

    const reclassified = findPerson(result, NO_LONGER_FLAGGED.id);
    const current = findPerson(result, CURRENT.id);

    expect(reclassified.actualShifts).toBe(1);
    expect(reclassified.opportunityCount).toBe(0);
    expect(reclassified.target).toBe(0);

    // CURRENT holds the group's only opportunities (2: day + night, both
    // free) and therefore absorbs the group's ENTIRE total actual (2: their
    // own 1 shift plus the reclassified colleague's 1 shift) as their own
    // target -- landing them "below" despite having worked every opportunity
    // they were actually offered.
    expect(current.opportunityCount).toBe(2);
    expect(current.actualShifts).toBe(1);
    expect(current.target).toBe(2);
    expect(current.status).toBe("below");
  });

  it("a dual-capable person's primary group is supervisor, but real confirmed technician evidence still surfaces in the technician group too", () => {
    // A dual-capable (supervisor + technician) person's PRIMARY comparison
    // group is "supervisor" (fairnessGroups.ts precedence) -- but if they
    // also have real confirmed TECHNICIAN evidence, that work must not
    // disappear from the technician group's own results either.
    const DUAL = person({ id: "p_dual", isSupervisor: true, isTechnician: true });
    const date = "2026-08-10";
    const events: Event[] = [shiftEvent({ personId: DUAL.id, date, role: "technician" })];

    const technicianResult = computeShiftFairnessForGroup("technician", [DUAL], events, [date]);
    expect(technicianResult.people).toHaveLength(1);
    expect(findPerson(technicianResult, DUAL.id).actualShifts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Sanity check against a realistic, synthetic multi-person roster.
//
// The repository has no live Google Sheets credentials and CLAUDE.md
// forbids committing real operational data/personnel names -- there is no
// safe fixture of REAL workbook data this PR can sanity-check against. This
// is instead a broad, internally-consistent synthetic scenario (mixed
// personnel types, constraints, absences, a bounded reservist window, and a
// weekend split) covering two weeks, exercised end-to-end through the same
// public entry point a future read-model would call, checking the engine
// stays internally consistent (every number finite, every target
// non-negative, actual/opportunity accounting adds up) rather than any one
// hand-picked number.
// ---------------------------------------------------------------------------

describe("computeShiftFairnessForGroup — sanity check against a realistic synthetic roster", () => {
  it("stays internally consistent across a two-week mixed roster", () => {
    const dates = [
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ];

    const REG_A = person({ id: "p_reg_a", name: "רגיל א", isTechnician: true, personnelType: "חובה" });
    const REG_B = person({ id: "p_reg_b", name: "רגיל ב", isTechnician: true, personnelType: "חובה" });
    const PERM_NO_EVIDENCE = person({ id: "p_perm", name: "קבע", isTechnician: true, personnelType: "קבע" });
    const RESERVIST = person({ id: "p_res", name: "מילואים", isTechnician: true, personnelType: "מילואים" });
    const UNCLASSIFIED = person({ id: "p_unk", name: "לא מסווג", isTechnician: true, personnelType: null });

    const people = [REG_A, REG_B, PERM_NO_EVIDENCE, RESERVIST, UNCLASSIFIED];

    const events: Event[] = [
      // REG_A: mostly available, one full-day constraint.
      shiftEvent({ personId: REG_A.id, date: "2026-08-11", period: "day" }),
      shiftEvent({ personId: REG_A.id, date: "2026-08-13", period: "night" }),
      shiftEvent({ personId: REG_A.id, date: "2026-08-20", period: "day" }),
      constraintEvent({ personId: REG_A.id, date: "2026-08-17", period: "unspecified" }),

      // REG_B: one blocking absence, one day-only constraint.
      shiftEvent({ personId: REG_B.id, date: "2026-08-12", period: "day" }),
      shiftEvent({ personId: REG_B.id, date: "2026-08-14", period: "night" }),
      absenceEvent({ personId: REG_B.id, date: "2026-08-21", absenceKind: "vacation" }),
      constraintEvent({ personId: REG_B.id, date: "2026-08-22", period: "day" }),

      // RESERVIST: bounded evidence window, mid-period.
      shiftEvent({ personId: RESERVIST.id, date: "2026-08-15", period: "day" }),
      shiftEvent({ personId: RESERVIST.id, date: "2026-08-16", period: "night" }),
      shiftEvent({ personId: RESERVIST.id, date: "2026-08-17", period: "day" }),

      // UNCLASSIFIED: one real confirmed shift proves participation.
      shiftEvent({ personId: UNCLASSIFIED.id, date: "2026-08-18", period: "night" }),

      // PERM_NO_EVIDENCE: capable, but never actually appears -- must contribute nothing.
    ];

    const result = computeShiftFairnessForGroup("technician", people, events, dates);

    expect(result.people).toHaveLength(5);

    const totalActual = result.people.reduce((sum, row) => sum + row.actualShifts, 0);
    const totalTarget = result.people.reduce((sum, row) => sum + row.target, 0);

    for (const row of result.people) {
      expect(Number.isFinite(row.target)).toBe(true);
      expect(row.target).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(row.deviation)).toBe(true);
      expect(row.opportunityCount).toBeGreaterThanOrEqual(0);
      expect(["below", "balanced", "above"]).toContain(row.status);
      expect(["below", "balanced", "above"]).toContain(row.weekendStatus);
    }

    // The sum of every personal target reconstructs the group's total actual
    // (targets are a pure re-distribution of the same real workload).
    expect(totalTarget).toBeCloseTo(totalActual, 10);

    // The permanent person with zero evidence must never receive any share.
    const perm = findPerson(result, PERM_NO_EVIDENCE.id);
    expect(perm.opportunityCount).toBe(0);
    expect(perm.target).toBe(0);
    expect(perm.actualShifts).toBe(0);

    // The reservist's opportunities must stay bounded to their own evidence window (2026-08-15..2026-08-17 = 3 dates * 2 = 6), never the full 14-date period.
    const reservist = findPerson(result, RESERVIST.id);
    expect(reservist.opportunityCount).toBeLessThanOrEqual(6);
  });
});
