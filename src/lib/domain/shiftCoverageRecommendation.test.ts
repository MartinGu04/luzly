import { describe, expect, it } from "vitest";
import { detectOperationalIssues, type OperationalIssue } from "./operationalIssues";
import { buildShiftSchedule } from "./shiftSchedule";
import type { Event } from "./event";
import type { Person } from "./types";
import { buildShiftCoverageRecommendation, dayOffsetMinutes, MAX_RECOMMENDATION_CANDIDATES } from "./shiftCoverageRecommendation";

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

  it("19. an ambiguous ('morning') constraint is never fabricated into an exclusion", () => {
    const TECH_A = person({ id: "p_tech_a", name: "איתי טכנאי", isTechnician: true });
    const events = [
      shiftEvent({ personId: SUP.id, role: "supervisor" }),
      constraintEvent({ personId: TECH_A.id, period: "morning" }),
    ];
    const people = [SUP, TECH_A];
    const issue = findCoverageIssue(events, people);
    const recommendation = buildShiftCoverageRecommendation(issue, people, events, schedule);
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
