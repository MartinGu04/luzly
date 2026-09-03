import { describe, expect, it } from "vitest";
import { detectOperationalIssues, type OperationalIssue } from "./operationalIssues";
import { EMPTY_RESERVE_ROLE_PARTICIPATION, type ReserveRoleParticipation } from "./reserveParticipation";
import { buildShiftSchedule } from "./shiftSchedule";
import type { Event } from "./event";
import type { Person } from "./types";
import {
  buildShiftCoverageRecommendation,
  dayOffsetMinutes,
  MAX_RECOMMENDATION_CANDIDATES,
  RESERVE_RECENT_SHIFT_EVIDENCE_WINDOW_DAYS,
} from "./shiftCoverageRecommendation";

// day 07:30-19:30 (450-1170), night 19:30-07:30(+1) (1170-1890)
const schedule = buildShiftSchedule("07:30");

const DATE = "2026-08-13";
const PREV_DATE = "2026-08-12";
const NEXT_DATE = "2026-08-14";

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

// Default personnelType is "חובה" (regular/mandatory service, PR #39) so
// every pre-existing fixture person is automatically eligible for
// participation without needing Fairness/shift evidence -- the same
// normal-pool status these fixtures always implicitly represented, now
// made explicit. Participation-specific tests below override this per case
// (permanent/reserve/unclassified).
function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_x",
    name: "שם",
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: "חובה",
    dischargeDate: null,
    enlistmentDate: null,
    ...overrides,
  };
}

function shiftEvent(overrides: Partial<Event> & { personId: string }): Event {
  return {
    personName: "",
    date: DATE,
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

function absenceEvent(overrides: Partial<Event> & { personId: string }): Event {
  return shiftEvent({
    category: "absence",
    role: null,
    period: "unspecified",
    absenceKind: "vacation",
    title: "חופש",
    rawValue: "חופש",
    ...overrides,
  });
}

function constraintEvent(overrides: Partial<Event> & { personId: string }): Event {
  return shiftEvent({
    category: "constraint",
    role: null,
    title: "אילוץ",
    rawValue: "אילוץ",
    ...overrides,
  });
}

function dutyEvent(overrides: Partial<Event> & { personId: string }): Event {
  return shiftEvent({
    category: "duty",
    role: null,
    period: "unspecified",
    dutyFamily: "guard",
    slot: 1,
    title: "שומר 1",
    rawValue: "שומר 1",
    ...overrides,
  });
}

/** Builds a `ReserveRoleParticipation` with only the given technician/supervisor ids as Fairness-evidenced -- never a raw Fairness row, matching the minimal projection `buildShiftCoverageRecommendation` actually receives. */
function participation(overrides: { technicianIds?: string[]; supervisorIds?: string[] } = {}): ReserveRoleParticipation {
  return {
    technicianPersonIds: new Set(overrides.technicianIds ?? []),
    supervisorPersonIds: new Set(overrides.supervisorIds ?? []),
  };
}

/** Runs the real `detectOperationalIssues` pipeline and returns the (only) coverage-reason issue -- never a hand-built fake `OperationalIssue`, so `missingIntervals`/`targetEvent` stay internally consistent with real domain output. */
function findCoverageIssue(events: readonly Event[], people: readonly Person[]): OperationalIssue {
  const issues = detectOperationalIssues(events, people, schedule);
  const issue = issues.find((i) => i.reason === "shift_coverage_missing" || i.reason === "shift_coverage_partial");
  if (!issue) throw new Error("fixture does not produce a coverage issue");
  return issue;
}

const SUP = person({ id: "p_sup", name: "אורי אחמ״ש", isSupervisor: true });

describe("buildShiftCoverageRecommendation — missing technician: core behavior", () => {
  it("1. a regular technician-capable person is included", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
    const people = [SUP, TECH_A];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation).not.toBeNull();
    expect(recommendation?.missingRole).toBe("technician");
    expect(recommendation?.primaryCandidateIds).toEqual([TECH_A.id]);
    expect(recommendation?.fallbackCandidateIds).toEqual([]);
  });

  it("2. an ordinary supervisor (not technician-capable) is never a technician candidate", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const SUP2 = person({ id: "p_sup2", name: "רועי אחמ״ש", isSupervisor: true });
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
    const people = [SUP, TECH_A, SUP2];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).not.toContain(SUP2.id);
    expect(recommendation?.fallbackCandidateIds).not.toContain(SUP2.id);
  });

  it("3. a supervisor+technician (dual-role) person is excluded from PRIMARY candidates", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const DUAL = person({ id: "p_dual", name: "טוביה כפול", isTechnician: true, isSupervisor: true });
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
    const people = [SUP, TECH_A, DUAL];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([TECH_A.id]);
    expect(recommendation?.primaryCandidateIds).not.toContain(DUAL.id);
  });

  it("4. the dual-role fallback is hidden entirely while at least one regular technician is eligible", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const DUAL = person({ id: "p_dual", name: "טוביה כפול", isTechnician: true, isSupervisor: true });
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
    const people = [SUP, TECH_A, DUAL];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.fallbackCandidateIds).toEqual([]);
  });

  it("5. the fallback appears only once zero regular technician candidates remain", () => {
    const DUAL = person({ id: "p_dual", name: "טוביה כפול", isTechnician: true, isSupervisor: true });
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
    const people = [SUP, DUAL];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([]);
    expect(recommendation?.fallbackCandidateIds).toEqual([DUAL.id]);
  });

  it("6. the fallback pool includes only isTechnician===true && isSupervisor===true people", () => {
    const DUAL_A = person({ id: "p_dual_a", name: "טוביה כפול", isTechnician: true, isSupervisor: true });
    const DUAL_B = person({ id: "p_dual_b", name: "רועי כפול", isTechnician: true, isSupervisor: true });
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
    const people = [SUP, DUAL_A, DUAL_B];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(new Set(recommendation?.fallbackCandidateIds)).toEqual(new Set([DUAL_A.id, DUAL_B.id]));
  });

  it("7. ordinary supervisors (not technician-capable) never appear in the fallback either", () => {
    const SUP2 = person({ id: "p_sup2", name: "רועי אחמ״ש", isSupervisor: true });
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
    const people = [SUP, SUP2];
    const issue = findCoverageIssue(events, people);

    // Zero technician-capable people at all -> no fabricated recommendation.
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation).toBeNull();
  });
});

describe("buildShiftCoverageRecommendation — eligibility exclusions", () => {
  function missingTechnicianFixture(candidateOverrides: Partial<Event> & { personId: string }) {
    const CANDIDATE = person({ id: candidateOverrides.personId, name: "מועמד", isTechnician: true });
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" }), shiftEvent(candidateOverrides)];
    const people = [SUP, CANDIDATE];
    return { CANDIDATE, events, people };
  }

  it("8. a blocking vacation absence excludes the candidate", () => {
    const { CANDIDATE, events, people } = missingTechnicianFixture({
      personId: "p_cand",
      category: "absence",
      role: null,
      period: "unspecified",
      absenceKind: "vacation",
      title: "חופש",
      rawValue: "חופש",
    });
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds ?? []).not.toContain(CANDIDATE.id);
    expect(recommendation).toBeNull();
  });

  it("9. a medical absence excludes the candidate", () => {
    const { events, people } = missingTechnicianFixture({
      personId: "p_cand",
      category: "absence",
      role: null,
      period: "unspecified",
      absenceKind: "medical",
      title: "מחלה",
      rawValue: "מחלה",
    });
    const issue = findCoverageIssue(events, people);
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });

  it("10. an abroad absence excludes the candidate", () => {
    const { events, people } = missingTechnicianFixture({
      personId: "p_cand",
      category: "absence",
      role: null,
      period: "unspecified",
      absenceKind: "abroad",
      title: "חו״ל",
      rawValue: "חו״ל",
    });
    const issue = findCoverageIssue(events, people);
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });

  it("11. a day-off absence excludes the candidate", () => {
    const { events, people } = missingTechnicianFixture({
      personId: "p_cand",
      category: "absence",
      role: null,
      period: "unspecified",
      absenceKind: "day_off",
      title: "יום חופש",
      rawValue: "יום חופש",
    });
    const issue = findCoverageIssue(events, people);
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });

  it("12. 'after' is NOT automatically treated as a blocking full-day absence", () => {
    const { CANDIDATE, events, people } = missingTechnicianFixture({
      personId: "p_cand",
      category: "absence",
      role: null,
      period: "unspecified",
      absenceKind: "after",
      title: "אפטר",
      rawValue: "אפטר",
    });
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([CANDIDATE.id]);
  });

  it("13. a candidate already covering the affected shift is excluded (never re-suggested)", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    // TECH_A already staffs this exact (date, period) -- coverage is therefore full, not missing/partial,
    // so no issue is even produced; this proves the domain never suggests someone already there.
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      shiftEvent({ personId: TECH_A.id, role: "technician" }),
    ];
    const issues = detectOperationalIssues(events, [SUP, TECH_A], schedule);
    expect(issues.some((i) => i.reason === "shift_coverage_missing" || i.reason === "shift_coverage_partial")).toBe(
      false,
    );
  });

  it("14. a candidate with a conflicting (overlapping) shift is excluded", () => {
    // Partial coverage: TECH_PARTIAL covers only 07:30-09:30, leaving 09:30-19:30 missing.
    const TECH_PARTIAL = person({ id: "p_partial", name: "נועה חלקי", isTechnician: true });
    const TECH_CONFLICT = person({ id: "p_conflict", name: "דנה קונפליקט", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      shiftEvent({ personId: TECH_PARTIAL.id, role: "technician", endTimeOverride: "09:30" }),
      // A separate, unrelated technician shift the SAME (date, period) covering only part of the day --
      // TECH_CONFLICT is providing part of the very coverage the recommendation searches for, so they
      // must never be re-suggested (already accounted for via the shift-group exclusion).
      shiftEvent({ personId: TECH_CONFLICT.id, role: "technician", startTimeOverride: "12:00", endTimeOverride: "14:00" }),
    ];
    const people = [SUP, TECH_PARTIAL, TECH_CONFLICT];
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds ?? []).not.toContain(TECH_CONFLICT.id);
    expect(recommendation?.primaryCandidateIds ?? []).not.toContain(TECH_PARTIAL.id);
  });

  it("15. a candidate whose shift does NOT overlap the missing interval is handled via canonical interval semantics, not naive same-date exclusion", () => {
    const TECH_PARTIAL = person({ id: "p_partial", name: "נועה חלקי", isTechnician: true });
    const TECH_NIGHT = person({ id: "p_night", name: "רון לילה", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      // Missing 09:30-19:30 (day).
      shiftEvent({ personId: TECH_PARTIAL.id, role: "technician", endTimeOverride: "09:30" }),
      // TECH_NIGHT has a shift the SAME calendar date, but a DIFFERENT period (night, 19:30-07:30+1) --
      // structurally adjacent to the day window, never overlapping it.
      shiftEvent({ personId: TECH_NIGHT.id, role: "technician", period: "night" }),
    ];
    const people = [SUP, TECH_PARTIAL, TECH_NIGHT];
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toContain(TECH_NIGHT.id);
  });

  it("16. a proven conflicting shift (this domain's only provable Event-level conflict) excludes the candidate", () => {
    // Missing coverage entirely (whole canonical day window). TECH_UNSPECIFIED has an unresolved
    // (unspecified-period) shift the same date -- timing can't be proven safe, so it excludes them.
    const TECH_UNSPECIFIED = person({ id: "p_unspecified", name: "גיא לא ברור", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      shiftEvent({ personId: TECH_UNSPECIFIED.id, role: "technician", period: "unspecified" }),
    ];
    const people = [SUP, TECH_UNSPECIFIED];
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds ?? []).not.toContain(TECH_UNSPECIFIED.id);
  });

  it("17. a same-date duty that cannot be proven to conflict is NOT falsely treated as unavailability", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      dutyEvent({ personId: TECH_A.id }),
    ];
    const people = [SUP, TECH_A];
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([TECH_A.id]);
  });

  it("18. an existing, structurally usable constraint excludes the candidate", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      constraintEvent({ personId: TECH_A.id, period: "day" }),
    ];
    const people = [SUP, TECH_A];
    const issue = findCoverageIssue(events, people);
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });

  it("an unspecified-period constraint (blocks the whole day) also excludes the candidate", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      constraintEvent({ personId: TECH_A.id, period: "unspecified" }),
    ];
    const people = [SUP, TECH_A];
    const issue = findCoverageIssue(events, people);
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });

  it("19. an ambiguous ('morning') constraint excludes the candidate conservatively -- uncertainty is never read as a positive availability claim", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      constraintEvent({ personId: TECH_A.id, period: "morning" }),
    ];
    const people = [SUP, TECH_A];
    const issue = findCoverageIssue(events, people);
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });

  it("a constraint on the PROVABLY disjoint opposite period (night constraint against a day issue) remains eligible", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor", period: "day" }),
      constraintEvent({ personId: TECH_A.id, period: "night" }),
    ];
    const people = [SUP, TECH_A];
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([TECH_A.id]);
  });
});

describe("buildShiftCoverageRecommendation — overnight-aware blocking absence / constraint checks (review round)", () => {
  // A night shift dated DATE, missing coverage only for the tail 05:30–07:30
  // on NEXT_DATE (the following calendar day) -- the SAME shape as a
  // reported real-world gap: nearly the whole night is covered, but the
  // handover-adjacent early morning isn't.
  function overnightPartialGapFixture() {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor", period: "night" }),
      // Covers 19:30–05:30, leaving 05:30–07:30 (NEXT_DATE) missing.
      shiftEvent({ personId: "p_tech_partial", role: "technician", period: "night", endTimeOverride: "05:30" }),
    ];
    const people = [
      SUP,
      TECH_A,
      person({ id: "p_tech_partial", name: "נועה חלקי", isTechnician: true }),
    ];
    return { TECH_A, events, people };
  }

  it("the overnight gap is anchored on the correct next-day hours", () => {
    const { events, people } = overnightPartialGapFixture();
    const issue = findCoverageIssue(events, people);
    expect(issue.reason).toBe("shift_coverage_partial");
    expect(issue.missingIntervals).toEqual([{ startMinute: 1770, endMinute: 1890 }]); // 05:30–07:30, day offset +1
  });

  it("a blocking vacation absence on the NEXT calendar day (touched by the overnight gap) excludes the candidate", () => {
    const { TECH_A, events, people } = overnightPartialGapFixture();
    const withAbsence = [
      ...events,
      absenceEvent({ personId: TECH_A.id, date: NEXT_DATE, absenceKind: "vacation" }),
    ];
    const issue = findCoverageIssue(withAbsence, people);
    expect(buildShiftCoverageRecommendation(issue, people, withAbsence, schedule)).toBeNull();
  });

  it("a next-day medical absence excludes the candidate", () => {
    const { TECH_A, events, people } = overnightPartialGapFixture();
    const withAbsence = [
      ...events,
      absenceEvent({ personId: TECH_A.id, date: NEXT_DATE, absenceKind: "medical" }),
    ];
    const issue = findCoverageIssue(withAbsence, people);
    expect(buildShiftCoverageRecommendation(issue, people, withAbsence, schedule)).toBeNull();
  });

  it("a next-day abroad absence excludes the candidate", () => {
    const { TECH_A, events, people } = overnightPartialGapFixture();
    const withAbsence = [
      ...events,
      absenceEvent({ personId: TECH_A.id, date: NEXT_DATE, absenceKind: "abroad" }),
    ];
    const issue = findCoverageIssue(withAbsence, people);
    expect(buildShiftCoverageRecommendation(issue, people, withAbsence, schedule)).toBeNull();
  });

  it("a next-day day_off absence excludes the candidate", () => {
    const { TECH_A, events, people } = overnightPartialGapFixture();
    const withAbsence = [
      ...events,
      absenceEvent({ personId: TECH_A.id, date: NEXT_DATE, absenceKind: "day_off" }),
    ];
    const issue = findCoverageIssue(withAbsence, people);
    expect(buildShiftCoverageRecommendation(issue, people, withAbsence, schedule)).toBeNull();
  });

  it("a next-day 'after' absence is NOT automatically blocking, even when it touches the overnight gap", () => {
    const { TECH_A, events, people } = overnightPartialGapFixture();
    const withAbsence = [
      ...events,
      absenceEvent({ personId: TECH_A.id, date: NEXT_DATE, absenceKind: "after" }),
    ];
    const issue = findCoverageIssue(withAbsence, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, withAbsence, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([TECH_A.id]);
  });

  it("a next-day absence does NOT falsely exclude a candidate for a plain DAYTIME issue that never touches the next date", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor", period: "day" }),
      absenceEvent({ personId: TECH_A.id, date: NEXT_DATE, absenceKind: "vacation" }),
    ];
    const people = [SUP, TECH_A];
    const issue = findCoverageIssue(events, people);
    expect(issue.missingIntervals).toEqual([{ startMinute: 450, endMinute: 1170 }]); // whole day window, DATE only
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([TECH_A.id]);
  });

  it("an ambiguous ('morning') constraint on the NEXT calendar day (touched by the overnight gap) also excludes the candidate", () => {
    const { TECH_A, events, people } = overnightPartialGapFixture();
    const withConstraint = [
      ...events,
      constraintEvent({ personId: TECH_A.id, date: NEXT_DATE, period: "morning" }),
    ];
    const issue = findCoverageIssue(withConstraint, people);
    expect(buildShiftCoverageRecommendation(issue, people, withConstraint, schedule)).toBeNull();
  });

  it("a 'night' constraint dated the day AFTER the overnight gap refers to the FOLLOWING night and does not exclude the candidate", () => {
    const { TECH_A, events, people } = overnightPartialGapFixture();
    const withConstraint = [
      ...events,
      // Refers to the night starting 19:30 on NEXT_DATE -- never overlaps
      // the missing 05:30-07:30 tail of the PREVIOUS night's shift.
      constraintEvent({ personId: TECH_A.id, date: NEXT_DATE, period: "night" }),
    ];
    const issue = findCoverageIssue(withConstraint, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, withConstraint, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([TECH_A.id]);
  });

  it("a 'night' constraint on the SAME date as the overnight shift's start excludes the candidate (its canonical window contains the missing tail)", () => {
    const { TECH_A, events, people } = overnightPartialGapFixture();
    const withConstraint = [
      ...events,
      // Refers to the night starting 19:30 on DATE (1170-1890) -- the same
      // night whose tail (1770-1890) is missing.
      constraintEvent({ personId: TECH_A.id, date: DATE, period: "night" }),
    ];
    const issue = findCoverageIssue(withConstraint, people);
    expect(buildShiftCoverageRecommendation(issue, people, withConstraint, schedule)).toBeNull();
  });

  it("a 'day' constraint on the SAME date as a whole-day missing gap excludes the candidate", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor", period: "day" }),
      constraintEvent({ personId: TECH_A.id, date: DATE, period: "day" }),
    ];
    const people = [SUP, TECH_A];
    const issue = findCoverageIssue(events, people);
    expect(issue.missingIntervals).toEqual([{ startMinute: 450, endMinute: 1170 }]); // whole day window
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });

  it("a 'day' constraint whose canonical window only PARTIALLY overlaps the actual (partial) missing interval still excludes the candidate", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const TECH_PARTIAL = person({ id: "p_tech_partial", name: "נועה חלקי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor", period: "day" }),
      // Covers 07:30-09:30, leaving 09:30-19:30 missing (570-1170) -- a
      // strict subset of the constraint's full canonical day window
      // (450-1170), not an exact match.
      shiftEvent({ personId: TECH_PARTIAL.id, role: "technician", period: "day", endTimeOverride: "09:30" }),
      constraintEvent({ personId: TECH_A.id, date: DATE, period: "day" }),
    ];
    const people = [SUP, TECH_A, TECH_PARTIAL];
    const issue = findCoverageIssue(events, people);
    expect(issue.missingIntervals).toEqual([{ startMinute: 570, endMinute: 1170 }]);
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });

  it("an unspecified next-day constraint still excludes the candidate", () => {
    const { TECH_A, events, people } = overnightPartialGapFixture();
    const withConstraint = [
      ...events,
      constraintEvent({ personId: TECH_A.id, date: NEXT_DATE, period: "unspecified" }),
    ];
    const issue = findCoverageIssue(withConstraint, people);
    expect(buildShiftCoverageRecommendation(issue, people, withConstraint, schedule)).toBeNull();
  });

  it("a 'day' constraint on the NEXT calendar day does not exclude the candidate when its window starts exactly where the missing gap ends", () => {
    const { TECH_A, events, people } = overnightPartialGapFixture();
    const withConstraint = [
      ...events,
      // Day window on NEXT_DATE is 1890-2610; the missing gap is 1770-1890
      // -- they touch at 1890 but never overlap.
      constraintEvent({ personId: TECH_A.id, date: NEXT_DATE, period: "day" }),
    ];
    const issue = findCoverageIssue(withConstraint, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, withConstraint, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([TECH_A.id]);
  });
});

describe("buildShiftCoverageRecommendation — partial coverage is interval-aware", () => {
  it("20. checks the ACTUAL missing interval, not merely the calendar date", () => {
    const TECH_PARTIAL = person({ id: "p_partial", name: "נועה חלקי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      shiftEvent({ personId: TECH_PARTIAL.id, role: "technician", endTimeOverride: "09:30" }),
    ];
    const people = [SUP, TECH_PARTIAL];
    const issue = findCoverageIssue(events, people);
    expect(issue.reason).toBe("shift_coverage_partial");
    expect(issue.missingIntervals).toEqual([{ startMinute: 570, endMinute: 1170 }]); // 09:30-19:30
  });

  it("21. an overnight boundary is placed correctly on the shared timeline (dayOffsetMinutes)", () => {
    expect(dayOffsetMinutes(DATE, DATE)).toBe(0);
    expect(dayOffsetMinutes(DATE, NEXT_DATE)).toBe(1440);
    expect(dayOffsetMinutes(DATE, PREV_DATE)).toBe(-1440);
    expect(dayOffsetMinutes(DATE, "2026-08-20")).toBeNull();
  });

  it("a candidate's overnight shift ending exactly at the missing gap's start is correctly NOT a conflict", () => {
    const TECH_PARTIAL = person({ id: "p_partial", name: "נועה חלקי", isTechnician: true });
    const TECH_PREV_NIGHT = person({ id: "p_prev_night", name: "עומר לילה קודם", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      // Missing 07:30-09:30 (the first part of the day is what's missing here).
      shiftEvent({ personId: TECH_PARTIAL.id, role: "technician", startTimeOverride: "09:30" }),
      // TECH_PREV_NIGHT worked the PREVIOUS night, ending exactly 07:30 -- adjacent, not overlapping.
      shiftEvent({ personId: TECH_PREV_NIGHT.id, role: "technician", period: "night", date: PREV_DATE }),
    ];
    const people = [SUP, TECH_PARTIAL, TECH_PREV_NIGHT];
    const issue = findCoverageIssue(events, people);
    expect(issue.missingIntervals).toEqual([{ startMinute: 450, endMinute: 570 }]); // 07:30-09:30
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toContain(TECH_PREV_NIGHT.id);
  });

  it("22. an invalid start/end override on a candidate's nearby shift is resolved (not ignored) and excludes them conservatively", () => {
    const TECH_PARTIAL = person({ id: "p_partial", name: "נועה חלקי", isTechnician: true });
    const TECH_INVALID = person({ id: "p_invalid", name: "אלון לא תקין", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      shiftEvent({ personId: TECH_PARTIAL.id, role: "technician", endTimeOverride: "09:30" }),
      // endTimeOverride before startTimeOverride -> resolveEventShiftInterval reports "invalid".
      shiftEvent({
        personId: TECH_INVALID.id,
        role: "technician",
        period: "day",
        startTimeOverride: "18:00",
        endTimeOverride: "08:00",
      }),
    ];
    const people = [SUP, TECH_PARTIAL, TECH_INVALID];
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds ?? []).not.toContain(TECH_INVALID.id);
  });

  it("23. a candidate unavailable for only the missing interval is excluded", () => {
    const TECH_PARTIAL = person({ id: "p_partial", name: "נועה חלקי", isTechnician: true });
    // TECH_CONFLICT partially covers the SAME shift group in the missing window -- already accounted for.
    const TECH_CONFLICT = person({ id: "p_conflict", name: "דנה קונפליקט", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      shiftEvent({ personId: TECH_PARTIAL.id, role: "technician", endTimeOverride: "09:30" }),
      shiftEvent({ personId: TECH_CONFLICT.id, role: "technician", startTimeOverride: "09:30", endTimeOverride: "12:00" }),
    ];
    const people = [SUP, TECH_PARTIAL, TECH_CONFLICT];
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds ?? []).not.toContain(TECH_CONFLICT.id);
  });

  it("24. a candidate whose other assignment provably does not overlap the missing interval remains eligible", () => {
    const TECH_PARTIAL = person({ id: "p_partial", name: "נועה חלקי", isTechnician: true });
    const TECH_NEXT_DAY = person({ id: "p_next_day", name: "שירה מחר", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      // Missing 09:30-19:30.
      shiftEvent({ personId: TECH_PARTIAL.id, role: "technician", endTimeOverride: "09:30" }),
      // TECH_NEXT_DAY has a day shift the FOLLOWING calendar date -- entirely outside this issue's window.
      shiftEvent({ personId: TECH_NEXT_DAY.id, role: "technician", period: "day", date: NEXT_DATE }),
    ];
    const people = [SUP, TECH_PARTIAL, TECH_NEXT_DAY];
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toContain(TECH_NEXT_DAY.id);
  });
});

describe("buildShiftCoverageRecommendation — missing supervisor coverage", () => {
  const TECH = person({ id: "p_tech", name: "איתי טכנאי", isTechnician: true });

  it("25. a supervisor-capable person is included", () => {
    const SUP_CANDIDATE = person({ id: "p_sup_cand", name: "מאיה אחמ״שית", isSupervisor: true });
    const events = [shiftEvent({ personId: TECH.id, role: "technician" })];
    const people = [TECH, SUP_CANDIDATE];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.missingRole).toBe("supervisor");
    expect(recommendation?.primaryCandidateIds).toEqual([SUP_CANDIDATE.id]);
    expect(recommendation?.fallbackCandidateIds).toEqual([]);
  });

  it("a supervisor+technician person is still a valid normal SUPERVISOR candidate", () => {
    const DUAL = person({ id: "p_dual", name: "טוביה כפול", isTechnician: true, isSupervisor: true });
    const events = [shiftEvent({ personId: TECH.id, role: "technician" })];
    const people = [TECH, DUAL];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([DUAL.id]);
  });

  it("26. a regular technician without supervisor capability is excluded from supervisor candidates", () => {
    const TECH2 = person({ id: "p_tech2", name: "רון טכנאי", isTechnician: true });
    const events = [shiftEvent({ personId: TECH.id, role: "technician" })];
    const people = [TECH, TECH2];
    const issue = findCoverageIssue(events, people);

    // No supervisor-capable person exists at all -> no fabricated recommendation.
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
    expect(TECH2.isSupervisor).toBe(false);
  });

  it("never creates a reverse fallback suggesting regular technicians for supervisor coverage", () => {
    const TECH2 = person({ id: "p_tech2", name: "רון טכנאי", isTechnician: true });
    const events = [shiftEvent({ personId: TECH.id, role: "technician" })];
    const people = [TECH, TECH2];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation).toBeNull(); // never falls back to technicians
  });

  it("27. no supervisor-capable candidate at all -> no fabricated recommendation", () => {
    const events = [shiftEvent({ personId: TECH.id, role: "technician" })];
    const people = [TECH];
    const issue = findCoverageIssue(events, people);

    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });
});

describe("buildShiftCoverageRecommendation — ranking / limits", () => {
  it("28. more than 3 eligible candidates -> only 3 are ever returned", () => {
    const candidates = ["a", "b", "c", "d", "e"].map((suffix, index) =>
      person({ id: `p_${suffix}`, name: `טכנאי ${String.fromCharCode(0x05d0 + index)}`, isTechnician: true }),
    );
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
    const people = [SUP, ...candidates];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toHaveLength(MAX_RECOMMENDATION_CANDIDATES);
  });

  it("29. ordering is deterministic across repeated calls with the same input", () => {
    const candidates = ["a", "b", "c"].map((suffix, index) =>
      person({ id: `p_${suffix}`, name: `טכנאי ${String.fromCharCode(0x05d0 + index)}`, isTechnician: true }),
    );
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
    const people = [SUP, ...candidates];
    const issue = findCoverageIssue(events, people);

    const first = buildShiftCoverageRecommendation(issue, people, events, schedule);
    const second = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(first?.primaryCandidateIds).toEqual(second?.primaryCandidateIds);
  });

  it("ordering is by name, independent of input array order", () => {
    const TECH_B = person({ id: "p_tech_b", name: "ב טכנאי", isTechnician: true });
    const TECH_A = person({ id: "p_tech_a", name: "א טכנאי", isTechnician: true });
    const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
    const people = [SUP, TECH_B, TECH_A];
    const issue = findCoverageIssue(events, people);

    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
    expect(recommendation?.primaryCandidateIds).toEqual([TECH_A.id, TECH_B.id]);
  });
});

describe("buildShiftCoverageRecommendation — unsupported problems", () => {
  it("31. a blocking-absence issue never produces a recommendation", () => {
    const TECH = person({ id: "p_tech", name: "איתי טכנאי", isTechnician: true });
    const events = [
      absenceEvent({ personId: TECH.id, absenceKind: "vacation" }),
      shiftEvent({ personId: TECH.id, role: "technician" }),
    ];
    const people = [TECH];
    const issues = detectOperationalIssues(events, people, schedule);
    const issue = issues.find((i) => i.reason === "blocking_absence_with_assignment")!;
    expect(issue).toBeDefined();
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });

  it("32. an invalid-shift-time issue never produces a recommendation", () => {
    const TECH = person({ id: "p_tech", name: "איתי טכנאי", isTechnician: true });
    const events = [
      shiftEvent({ personId: TECH.id, role: "technician", startTimeOverride: "18:00", endTimeOverride: "08:00" }),
    ];
    const people = [TECH];
    const issues = detectOperationalIssues(events, people, schedule);
    const issue = issues.find((i) => i.reason === "invalid_shift_time")!;
    expect(issue).toBeDefined();
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });

  it("33. a role-capability-mismatch issue never produces a recommendation", () => {
    const NOT_A_TECH = person({ id: "p_not_tech", name: "לא טכנאי", isTechnician: false });
    const events = [shiftEvent({ personId: NOT_A_TECH.id, role: "technician" })];
    const people = [NOT_A_TECH];
    const issues = detectOperationalIssues(events, people, schedule);
    const issue = issues.find((i) => i.reason === "role_capability_mismatch")!;
    expect(issue).toBeDefined();
    expect(buildShiftCoverageRecommendation(issue, people, events, schedule)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PR #39 -- participation eligibility (separate from, and checked before,
// the interval-compatibility exclusions covered above).
// ---------------------------------------------------------------------------

describe("buildShiftCoverageRecommendation — PR #39 participation eligibility", () => {
  describe("permanent service (קבע) is never recommended", () => {
    it("a permanent technician is excluded from the primary technician pool even though capability is true", () => {
      const PERM_TECH = person({ id: "p_perm_tech", name: "קבוע טכנאי", personnelType: "קבע", isTechnician: true });
      const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
      const people = [SUP, PERM_TECH];
      const issue = findCoverageIssue(events, people);
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
      expect(recommendation).toBeNull();
    });

    it("a permanent supervisor is excluded from the primary supervisor pool even though capability is true", () => {
      const TECH_ANCHOR = person({ id: "p_tech_anchor", name: "עוגן", isTechnician: true });
      const PERM_SUP = person({ id: "p_perm_sup", name: "קבוע אחמ״ש", personnelType: "קבע", isSupervisor: true });
      const events = [shiftEvent({ personId: TECH_ANCHOR.id, role: "technician" })];
      const people = [TECH_ANCHOR, PERM_SUP];
      const issue = findCoverageIssue(events, people);
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
      expect(recommendation).toBeNull();
    });

    it("a permanent dual-role (technician+supervisor) person never enters the technician last-resort fallback, even with Fairness evidence", () => {
      const PERM_DUAL = person({
        id: "p_perm_dual",
        name: "קבוע כפול",
        personnelType: "קבע",
        dischargeDate: null,
        enlistmentDate: null,
        isTechnician: true,
        isSupervisor: true,
      });
      const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
      const people = [SUP, PERM_DUAL];
      const issue = findCoverageIssue(events, people);
      // Even fabricated Fairness evidence for this permanent person must never matter.
      const evidence = participation({ technicianIds: [PERM_DUAL.id] });
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, evidence);
      expect(recommendation).toBeNull();
    });
  });

  describe("regular/mandatory service (חובה) participates with capability alone -- no evidence required", () => {
    it("a regular technician is a candidate with zero Fairness/shift evidence", () => {
      const REGULAR_TECH = person({ id: "p_reg_tech", name: "חובה טכנאי", personnelType: "חובה", isTechnician: true });
      const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
      const people = [SUP, REGULAR_TECH];
      const issue = findCoverageIssue(events, people);
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, EMPTY_RESERVE_ROLE_PARTICIPATION);
      expect(recommendation?.primaryCandidateIds).toEqual([REGULAR_TECH.id]);
    });

    it("a regular supervisor is a candidate with zero Fairness/shift evidence", () => {
      const TECH = person({ id: "p_tech", name: "טכנאי", isTechnician: true });
      const REGULAR_SUP = person({ id: "p_reg_sup", name: "חובה אחמ״ש", personnelType: "חובה", isSupervisor: true });
      const events = [shiftEvent({ personId: TECH.id, role: "technician" })];
      const people = [TECH, REGULAR_SUP];
      const issue = findCoverageIssue(events, people);
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, EMPTY_RESERVE_ROLE_PARTICIPATION);
      expect(recommendation?.primaryCandidateIds).toEqual([REGULAR_SUP.id]);
    });
  });

  describe("unknown/missing personnelType fails conservatively", () => {
    it.each([
      ["null personnelType", null],
      ["an unrecognized personnelType string", "משהו לא מוכר"],
    ])("%s -- never a candidate, even with full capability and Fairness evidence", (_label, personnelType) => {
      const UNCLASSIFIED = person({ id: "p_unclassified", name: "לא מסווג", personnelType, isTechnician: true });
      const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
      const people = [SUP, UNCLASSIFIED];
      const issue = findCoverageIssue(events, people);
      const evidence = participation({ technicianIds: [UNCLASSIFIED.id] });
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, evidence);
      expect(recommendation).toBeNull();
    });
  });

  describe("reservists (מילואים) need capability AND positive evidence -- Fairness OR a recent confirmed same-role shift", () => {
    function reserveFixture(role: "technician" | "supervisor") {
      const anchorRole: "technician" | "supervisor" = role === "technician" ? "supervisor" : "technician";
      const ANCHOR = person({ id: "p_anchor", name: "עוגן", [anchorRole === "technician" ? "isTechnician" : "isSupervisor"]: true });
      const RESERVE = person({
        id: "p_reserve",
        name: "מילואימניק",
        personnelType: "מילואים",
        dischargeDate: null,
        enlistmentDate: null,
        isTechnician: role === "technician",
        isSupervisor: role === "supervisor",
      });
      const events = [shiftEvent({ personId: ANCHOR.id, role: anchorRole })];
      const people = [ANCHOR, RESERVE];
      return { RESERVE, events, people };
    }

    it.each(["technician", "supervisor"] as const)(
      "capability alone, with ZERO evidence, does NOT qualify a reserve %s",
      (role) => {
        const { events, people } = reserveFixture(role);
        const issue = findCoverageIssue(events, people);
        const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, EMPTY_RESERVE_ROLE_PARTICIPATION);
        expect(recommendation).toBeNull();
      },
    );

    it.each(["technician", "supervisor"] as const)(
      "a matching current-period Fairness allocation qualifies a reserve %s",
      (role) => {
        const { RESERVE, events, people } = reserveFixture(role);
        const issue = findCoverageIssue(events, people);
        const evidence =
          role === "technician" ? participation({ technicianIds: [RESERVE.id] }) : participation({ supervisorIds: [RESERVE.id] });
        const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, evidence);
        expect(recommendation?.primaryCandidateIds).toEqual([RESERVE.id]);
      },
    );

    it.each(["technician", "supervisor"] as const)(
      "a recent CONFIRMED same-role shift (no Fairness evidence at all) qualifies a reserve %s",
      (role) => {
        const { RESERVE, events, people } = reserveFixture(role);
        // 5 days before the issue date -- inside the window, far enough away to never overlap the missing interval.
        const evidenceShiftDate = "2026-08-08";
        const withEvidence = [...events, shiftEvent({ personId: RESERVE.id, role, date: evidenceShiftDate, certainty: "confirmed" })];
        const issue = findCoverageIssue(withEvidence, people);
        const recommendation = buildShiftCoverageRecommendation(issue, people, withEvidence, schedule, EMPTY_RESERVE_ROLE_PARTICIPATION);
        expect(recommendation?.primaryCandidateIds).toEqual([RESERVE.id]);
      },
    );

    describe("negative evidence -- none of these establish participation", () => {
      it("wrong-role Fairness evidence (technician evidence for a supervisor role) does not count", () => {
        const { RESERVE, events, people } = reserveFixture("supervisor");
        const evidence = participation({ technicianIds: [RESERVE.id] }); // wrong role
        const issue = findCoverageIssue(events, people);
        expect(buildShiftCoverageRecommendation(issue, people, events, schedule, evidence)).toBeNull();
      });

      it("Fairness evidence for a DIFFERENT person does not count for this candidate", () => {
        const { events, people } = reserveFixture("technician");
        const evidence = participation({ technicianIds: ["p_someone_else"] });
        const issue = findCoverageIssue(events, people);
        expect(buildShiftCoverageRecommendation(issue, people, events, schedule, evidence)).toBeNull();
      });

      it("'wrong H1/H2 period' -- the caller resolving the OTHER period's (empty) participation for this candidate does not count", () => {
        // Simulates the read-model layer having picked the period that does NOT
        // contain this reservist's Fairness row -- from this function's own
        // point of view that's indistinguishable from "no evidence at all".
        const { events, people } = reserveFixture("technician");
        const issue = findCoverageIssue(events, people);
        expect(buildShiftCoverageRecommendation(issue, people, events, schedule, EMPTY_RESERVE_ROLE_PARTICIPATION)).toBeNull();
      });

      it("a wrong-role recent shift (confirmed supervisor shift, technician role needed) does not count", () => {
        const { RESERVE, events, people } = reserveFixture("technician");
        const withWrongRoleShift = [
          ...events,
          shiftEvent({ personId: RESERVE.id, role: "supervisor", date: "2026-08-08", certainty: "confirmed" }),
        ];
        const issue = findCoverageIssue(withWrongRoleShift, people);
        expect(
          buildShiftCoverageRecommendation(issue, people, withWrongRoleShift, schedule, EMPTY_RESERVE_ROLE_PARTICIPATION),
        ).toBeNull();
      });

      it("a TENTATIVE same-role shift does not count as evidence", () => {
        const { RESERVE, events, people } = reserveFixture("technician");
        const withTentative = [
          ...events,
          shiftEvent({ personId: RESERVE.id, role: "technician", date: "2026-08-08", certainty: "tentative" }),
        ];
        const issue = findCoverageIssue(withTentative, people);
        expect(
          buildShiftCoverageRecommendation(issue, people, withTentative, schedule, EMPTY_RESERVE_ROLE_PARTICIPATION),
        ).toBeNull();
      });

      it(`an OLD same-role shift, more than ${RESERVE_RECENT_SHIFT_EVIDENCE_WINDOW_DAYS} days before the issue date, does not count`, () => {
        const { RESERVE, events, people } = reserveFixture("technician");
        const withOldShift = [
          ...events,
          shiftEvent({ personId: RESERVE.id, role: "technician", date: "2026-07-20", certainty: "confirmed" }),
        ];
        const issue = findCoverageIssue(withOldShift, people);
        expect(
          buildShiftCoverageRecommendation(issue, people, withOldShift, schedule, EMPTY_RESERVE_ROLE_PARTICIPATION),
        ).toBeNull();
      });

      it("missing role capability excludes a reservist even with matching Fairness evidence for that role", () => {
        // RESERVE has no isTechnician/isSupervisor capability at all.
        const RESERVE = person({ id: "p_reserve_nocap", name: "בלי יכולת", personnelType: "מילואים" });
        const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
        const people = [SUP, RESERVE];
        const issue = findCoverageIssue(events, people);
        const evidence = participation({ technicianIds: [RESERVE.id] });
        expect(buildShiftCoverageRecommendation(issue, people, events, schedule, evidence)).toBeNull();
      });
    });
  });

  describe("tier ordering and fallback gating", () => {
    it("regular and active-reserve technicians are BOTH normal primary candidates, with the regular one ordered first", () => {
      const REGULAR = person({ id: "p_regular", name: "ת חובה", personnelType: "חובה", isTechnician: true });
      const RESERVE = person({ id: "p_reserve", name: "א מילואים", personnelType: "מילואים", isTechnician: true });
      const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
      const people = [SUP, REGULAR, RESERVE];
      const issue = findCoverageIssue(events, people);
      const evidence = participation({ technicianIds: [RESERVE.id] });
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, evidence);
      // RESERVE's name ("א...") sorts before REGULAR's ("ת...") alphabetically,
      // proving the regular-first ordering is NOT just a name sort.
      expect(recommendation?.primaryCandidateIds).toEqual([REGULAR.id, RESERVE.id]);
    });

    it("an active-reserve technician (participation proven) prevents the dual-role technician fallback from ever appearing", () => {
      const RESERVE_TECH = person({ id: "p_reserve_tech", name: "מילואים טכנאי", personnelType: "מילואים", isTechnician: true });
      const DUAL = person({ id: "p_dual", name: "כפול", isTechnician: true, isSupervisor: true }); // regular by default
      const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
      const people = [SUP, RESERVE_TECH, DUAL];
      const issue = findCoverageIssue(events, people);
      const evidence = participation({ technicianIds: [RESERVE_TECH.id] });
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, evidence);
      expect(recommendation?.primaryCandidateIds).toEqual([RESERVE_TECH.id]);
      expect(recommendation?.fallbackCandidateIds).toEqual([]);
    });

    it("the dual-role fallback still appears once the entire normal (regular+reserve) technician pool is genuinely empty", () => {
      const DUAL = person({ id: "p_dual", name: "כפול", isTechnician: true, isSupervisor: true }); // regular by default
      const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
      const people = [SUP, DUAL];
      const issue = findCoverageIssue(events, people);
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, EMPTY_RESERVE_ROLE_PARTICIPATION);
      expect(recommendation?.primaryCandidateIds).toEqual([]);
      expect(recommendation?.fallbackCandidateIds).toEqual([DUAL.id]);
    });

    it("a reserve dual-role person needs TECHNICIAN-specific evidence to enter the fallback -- supervisor evidence alone is insufficient", () => {
      const RESERVE_DUAL = person({
        id: "p_reserve_dual",
        name: "מילואים כפול",
        personnelType: "מילואים",
        dischargeDate: null,
        enlistmentDate: null,
        isTechnician: true,
        isSupervisor: true,
      });
      const events = [shiftEvent({ personId: SUP.id, role: "supervisor" })];
      const people = [SUP, RESERVE_DUAL];
      const issue = findCoverageIssue(events, people);

      // Supervisor-only evidence: does NOT unlock the technician fallback.
      const supervisorOnlyEvidence = participation({ supervisorIds: [RESERVE_DUAL.id] });
      expect(buildShiftCoverageRecommendation(issue, people, events, schedule, supervisorOnlyEvidence)).toBeNull();

      // Technician evidence: unlocks it.
      const technicianEvidence = participation({ technicianIds: [RESERVE_DUAL.id] });
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, technicianEvidence);
      expect(recommendation?.primaryCandidateIds).toEqual([]);
      expect(recommendation?.fallbackCandidateIds).toEqual([RESERVE_DUAL.id]);
    });

    it("regular and active-reserve SUPERVISORS are both normal candidates, with the regular one ordered first (no technician fallback exists for supervisor)", () => {
      const TECH = person({ id: "p_tech", name: "טכנאי", isTechnician: true });
      const REGULAR_SUP = person({ id: "p_regular_sup", name: "ת חובה אחמ״ש", personnelType: "חובה", isSupervisor: true });
      const RESERVE_SUP = person({ id: "p_reserve_sup", name: "א מילואים אחמ״ש", personnelType: "מילואים", isSupervisor: true });
      const events = [shiftEvent({ personId: TECH.id, role: "technician" })];
      const people = [TECH, REGULAR_SUP, RESERVE_SUP];
      const issue = findCoverageIssue(events, people);
      const evidence = participation({ supervisorIds: [RESERVE_SUP.id] });
      const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule, evidence);
      expect(recommendation?.primaryCandidateIds).toEqual([REGULAR_SUP.id, RESERVE_SUP.id]);
      expect(recommendation?.fallbackCandidateIds).toEqual([]);
    });
  });
});
