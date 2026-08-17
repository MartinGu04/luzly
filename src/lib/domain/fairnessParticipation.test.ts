import { describe, expect, it } from "vitest";
import type { Event } from "./event";
import {
  resolveFairnessParticipationWindow,
  resolveFairnessRoleEligibility,
  resolveFairnessShiftOpportunity,
} from "./fairnessParticipation";
import { EMPTY_RESERVE_ROLE_PARTICIPATION, type ReserveRoleParticipation } from "./reserveParticipation";
import type { Person } from "./types";

const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-31";

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

// ---------------------------------------------------------------------------
// Participation window
// ---------------------------------------------------------------------------

describe("resolveFairnessParticipationWindow", () => {
  it("full-period participant: permanent (קבע) -> full_period, whole period, but only ASSUMED, never complete", () => {
    const p = person({ id: "p_1", personnelType: "קבע" });
    const window = resolveFairnessParticipationWindow(p, [], PERIOD_START, PERIOD_END);
    expect(window).toEqual({
      personId: "p_1",
      periodStartDate: PERIOD_START,
      periodEndDate: PERIOD_END,
      activeStartDate: PERIOD_START,
      activeEndDate: PERIOD_END,
      basis: "full_period",
      dataCompleteness: { status: "partial", reasons: ["participation_assumed_full_period"] },
    });
  });

  it("full-period participant: regular (חובה) -> full_period too, regardless of any Events, still only assumed", () => {
    const p = person({ id: "p_2", personnelType: "חובה" });
    const window = resolveFairnessParticipationWindow(p, [], PERIOD_START, PERIOD_END);
    expect(window.basis).toBe("full_period");
    expect(window.dataCompleteness).toEqual({ status: "partial", reasons: ["participation_assumed_full_period"] });
  });

  it("reservist with a bounded service window: inferred from Event evidence, never asserted as the full period", () => {
    const p = person({ id: "p_res", personnelType: "מילואים", isSupervisor: true });
    const events: Event[] = [
      shiftEvent({ personId: p.id, date: "2026-08-10", role: "supervisor" }),
      shiftEvent({ personId: p.id, date: "2026-08-15", role: "supervisor" }),
      shiftEvent({ personId: p.id, date: "2026-08-22", role: "supervisor" }),
    ];
    const window = resolveFairnessParticipationWindow(p, events, PERIOD_START, PERIOD_END);
    expect(window.basis).toBe("inferred_from_events");
    expect(window.activeStartDate).toBe("2026-08-10");
    expect(window.activeEndDate).toBe("2026-08-22");
    expect(window.dataCompleteness).toEqual({ status: "partial", reasons: ["participation_inferred"] });
  });

  it("reservist with zero Events in the period -> unknown, never a guessed window", () => {
    const p = person({ id: "p_res2", personnelType: "מילואים" });
    const window = resolveFairnessParticipationWindow(p, [], PERIOD_START, PERIOD_END);
    expect(window.basis).toBe("unknown");
    expect(window.activeStartDate).toBeNull();
    expect(window.activeEndDate).toBeNull();
    expect(window.dataCompleteness).toEqual({ status: "partial", reasons: ["participation_unknown"] });
  });

  it("Events outside the requested period are ignored when inferring a reservist's window", () => {
    const p = person({ id: "p_res3", personnelType: "מילואים" });
    const events: Event[] = [shiftEvent({ personId: p.id, date: "2026-07-15" })];
    const window = resolveFairnessParticipationWindow(p, events, PERIOD_START, PERIOD_END);
    expect(window.basis).toBe("unknown");
  });

  it("unclassified personnelType is never assumed full-period -- same evidence-only treatment as reserve", () => {
    const p = person({ id: "p_unk", personnelType: null });
    const events: Event[] = [shiftEvent({ personId: p.id, date: "2026-08-05" })];
    const window = resolveFairnessParticipationWindow(p, events, PERIOD_START, PERIOD_END);
    expect(window.basis).toBe("inferred_from_events");
    expect(window.activeStartDate).toBe("2026-08-05");
    expect(window.activeEndDate).toBe("2026-08-05");
  });

  it("KNOWN LIMITATION: a regular/permanent person joining mid-period cannot be distinguished from one present the whole period -- כ״א has no stored join/leave date, so this always resolves full_period", () => {
    const p = person({ id: "p_mid", personnelType: "חובה" });
    // Even though this person's only real evidence is late in the period...
    const events: Event[] = [shiftEvent({ personId: p.id, date: "2026-08-25" })];
    const window = resolveFairnessParticipationWindow(p, events, PERIOD_START, PERIOD_END);
    // ...current data still can't prove they joined mid-period; the model
    // honestly reflects that gap rather than inventing a bound.
    expect(window.basis).toBe("full_period");
    expect(window.activeStartDate).toBe(PERIOD_START);
  });
});

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

describe("resolveFairnessRoleEligibility", () => {
  it("person not eligible for a shift: missing the capability flag entirely", () => {
    const p = person({ id: "p_none", isTechnician: false, isSupervisor: false });
    const result = resolveFairnessRoleEligibility(p, "technician", [], PERIOD_START, PERIOD_END);
    expect(result).toEqual({
      personId: "p_none",
      role: "technician",
      eligible: false,
      basis: "not_capable",
      dataCompleteness: { status: "partial", reasons: ["eligibility_undated"] },
    });
  });

  it("permanent (קבע) with no evidence at all does not qualify -- capability alone is never enough (same evidence gate as reserve)", () => {
    const p = person({ id: "p_perm", personnelType: "קבע", isTechnician: true });
    const result = resolveFairnessRoleEligibility(p, "technician", [], PERIOD_START, PERIOD_END);
    expect(result.eligible).toBe(false);
    expect(result.basis).toBe("evidence_not_found");
  });

  it("permanent (קבע) WITH a confirmed same-role shift in the period IS eligible -- actual participation is never excluded merely for personnelType (reconsidered: the old shiftCoverageRecommendation-style blanket exclusion was scoped to that feature's candidate pool, not a domain-wide fact)", () => {
    const p = person({ id: "p_perm2", personnelType: "קבע", isSupervisor: true });
    const events: Event[] = [shiftEvent({ personId: p.id, date: "2026-08-14", role: "supervisor" })];
    const result = resolveFairnessRoleEligibility(p, "supervisor", events, PERIOD_START, PERIOD_END);
    expect(result.eligible).toBe(true);
    expect(result.basis).toBe("evidence_confirmed");
  });

  it("permanent (קבע) qualifies via the period's own Fairness-table evidence too, same as reserve", () => {
    const p = person({ id: "p_perm3", personnelType: "קבע", isTechnician: true });
    const evidence = participationEvidence({ technicianIds: [p.id] });
    const result = resolveFairnessRoleEligibility(p, "technician", [], PERIOD_START, PERIOD_END, evidence);
    expect(result.eligible).toBe(true);
    expect(result.basis).toBe("evidence_confirmed");
  });

  it("regular (חובה) is eligible whenever capable, no further evidence required", () => {
    const p = person({ id: "p_reg", personnelType: "חובה", isSupervisor: true });
    const result = resolveFairnessRoleEligibility(p, "supervisor", [], PERIOD_START, PERIOD_END);
    expect(result.eligible).toBe(true);
    expect(result.basis).toBe("regular_included");
  });

  it("unclassified personnelType is never guessed into eligibility", () => {
    const p = person({ id: "p_unk", personnelType: "משהו לא מוכר", isTechnician: true });
    const result = resolveFairnessRoleEligibility(p, "technician", [], PERIOD_START, PERIOD_END);
    expect(result.eligible).toBe(false);
    expect(result.basis).toBe("unclassified_excluded");
  });

  it("reservist qualifies via the period's own Fairness-table evidence", () => {
    const p = person({ id: "p_res", personnelType: "מילואים", isTechnician: true });
    const evidence = participationEvidence({ technicianIds: [p.id] });
    const result = resolveFairnessRoleEligibility(p, "technician", [], PERIOD_START, PERIOD_END, evidence);
    expect(result.eligible).toBe(true);
    expect(result.basis).toBe("evidence_confirmed");
  });

  it("reservist qualifies via a confirmed same-role shift within the period, absent Fairness evidence", () => {
    const p = person({ id: "p_res2", personnelType: "מילואים", isSupervisor: true });
    const events: Event[] = [shiftEvent({ personId: p.id, date: "2026-08-14", role: "supervisor" })];
    const result = resolveFairnessRoleEligibility(
      p,
      "supervisor",
      events,
      PERIOD_START,
      PERIOD_END,
      EMPTY_RESERVE_ROLE_PARTICIPATION,
    );
    expect(result.eligible).toBe(true);
    expect(result.basis).toBe("evidence_confirmed");
  });

  it("reservist with no evidence at all does not qualify -- capability alone is never enough", () => {
    const p = person({ id: "p_res3", personnelType: "מילואים", isTechnician: true });
    const result = resolveFairnessRoleEligibility(p, "technician", [], PERIOD_START, PERIOD_END);
    expect(result.eligible).toBe(false);
    expect(result.basis).toBe("evidence_not_found");
  });

  it("a tentative same-role shift is never treated as confirmed evidence", () => {
    const p = person({ id: "p_res4", personnelType: "מילואים", isTechnician: true });
    const events: Event[] = [
      shiftEvent({ personId: p.id, date: "2026-08-14", role: "technician", certainty: "tentative" }),
    ];
    const result = resolveFairnessRoleEligibility(p, "technician", events, PERIOD_START, PERIOD_END);
    expect(result.eligible).toBe(false);
  });

  it("KNOWN LIMITATION: eligibility is always the CURRENT capability snapshot for the whole period -- כ״א carries no effective-from date, so a qualification that only became valid partway through the period cannot be time-sliced today", () => {
    const p = person({ id: "p_newly_qualified", personnelType: "חובה", isTechnician: true });
    // No way to express "not qualified before Aug 15" with today's data --
    // the single current flag applies to the entire period uniformly.
    const result = resolveFairnessRoleEligibility(p, "technician", [], PERIOD_START, PERIOD_END);
    expect(result.eligible).toBe(true);
    expect(result.dataCompleteness).toEqual({ status: "partial", reasons: ["eligibility_undated"] });
  });
});

// ---------------------------------------------------------------------------
// Shift-slot availability
// ---------------------------------------------------------------------------

describe("resolveFairnessShiftOpportunity", () => {
  it("full-day constraint blocks both day and night opportunities", () => {
    const events: Event[] = [constraintEvent({ personId: "p", date: "2026-08-10", period: "unspecified" })];
    expect(resolveFairnessShiftOpportunity(events, "day")).toEqual({
      status: "blocked_constraint",
      dataCompleteness: { status: "complete", reasons: [] },
    });
    expect(resolveFairnessShiftOpportunity(events, "night")).toEqual({
      status: "blocked_constraint",
      dataCompleteness: { status: "complete", reasons: [] },
    });
  });

  it("day-only constraint blocks day, never night", () => {
    const events: Event[] = [constraintEvent({ personId: "p", date: "2026-08-10", period: "day" })];
    expect(resolveFairnessShiftOpportunity(events, "day").status).toBe("blocked_constraint");
    expect(resolveFairnessShiftOpportunity(events, "night").status).toBe("available");
  });

  it("night-only constraint blocks night, never day", () => {
    const events: Event[] = [constraintEvent({ personId: "p", date: "2026-08-10", period: "night" })];
    expect(resolveFairnessShiftOpportunity(events, "night").status).toBe("blocked_constraint");
    expect(resolveFairnessShiftOpportunity(events, "day").status).toBe("available");
  });

  it("a blocking absence blocks both periods and takes priority over a constraint check", () => {
    const events: Event[] = [absenceEvent({ personId: "p", date: "2026-08-10", absenceKind: "medical" })];
    expect(resolveFairnessShiftOpportunity(events, "day").status).toBe("blocked_absence");
  });

  it("a non-blocking absence kind (after) never blocks the shift-slot opportunity", () => {
    const events: Event[] = [absenceEvent({ personId: "p", date: "2026-08-10", absenceKind: "after" })];
    expect(resolveFairnessShiftOpportunity(events, "day").status).toBe("available");
  });

  it("missing/partial availability data: a morning constraint has no canonical day/night mapping -- never asserted blocked or available", () => {
    const events: Event[] = [constraintEvent({ personId: "p", date: "2026-08-10", period: "morning" })];
    const result = resolveFairnessShiftOpportunity(events, "day");
    expect(result.status).toBe("unmodeled_constraint");
    expect(result.dataCompleteness).toEqual({ status: "partial", reasons: ["constraint_period_unmodeled"] });
  });

  it("no absence/constraint at all -> available, with complete data", () => {
    const result = resolveFairnessShiftOpportunity([], "day");
    expect(result).toEqual({ status: "available", dataCompleteness: { status: "complete", reasons: [] } });
  });
});
