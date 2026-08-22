import { describe, expect, it } from "vitest";
import type { AbsenceKind, Event } from "./event";
import { computeShiftExpectationFactors } from "./shiftExpectationFactors";

const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-31";

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function baseEvent(overrides: Partial<Event> & { personId: string; date: string }): Event {
  return {
    personName: "",
    title: "",
    rawValue: "",
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

function absence(personId: string, date: string, absenceKind: AbsenceKind): Event {
  return baseEvent({ personId, date, category: "absence", absenceKind });
}

function constraint(personId: string, date: string): Event {
  return baseEvent({ personId, date, category: "constraint" });
}

describe("computeShiftExpectationFactors", () => {
  it("returns all-zero counts for no relevant events", () => {
    expect(computeShiftExpectationFactors([], "p1", PERIOD_START, PERIOD_END)).toEqual({
      leaveDays: 0,
      constraintDays: 0,
      referralDays: 0,
    });
  });

  it("counts blocking absence kinds as leave days", () => {
    const events = [
      absence("p1", "2026-08-05", "vacation"),
      absence("p1", "2026-08-06", "abroad"),
      absence("p1", "2026-08-07", "medical"),
      absence("p1", "2026-08-08", "day_off"),
    ];
    expect(computeShiftExpectationFactors(events, "p1", PERIOD_START, PERIOD_END).leaveDays).toBe(4);
  });

  it("does NOT count non-blocking absence kinds (after) as leave", () => {
    const events = [absence("p1", "2026-08-05", "after")];
    expect(computeShiftExpectationFactors(events, "p1", PERIOD_START, PERIOD_END).leaveDays).toBe(0);
  });

  it("counts referral as its own separate factor, not as leave", () => {
    const events = [absence("p1", "2026-08-05", "referral")];
    const result = computeShiftExpectationFactors(events, "p1", PERIOD_START, PERIOD_END);
    expect(result.referralDays).toBe(1);
    expect(result.leaveDays).toBe(0);
  });

  it("counts constraint-category events as constraint days", () => {
    const events = [constraint("p1", "2026-08-05"), constraint("p1", "2026-08-06")];
    expect(computeShiftExpectationFactors(events, "p1", PERIOD_START, PERIOD_END).constraintDays).toBe(2);
  });

  it("counts each distinct date once, even with multiple events on the same date", () => {
    const events = [constraint("p1", "2026-08-05"), constraint("p1", "2026-08-05")];
    expect(computeShiftExpectationFactors(events, "p1", PERIOD_START, PERIOD_END).constraintDays).toBe(1);
  });

  it("ignores events outside the requested period", () => {
    const events = [absence("p1", "2026-07-31", "vacation"), absence("p1", "2026-09-01", "vacation")];
    expect(computeShiftExpectationFactors(events, "p1", PERIOD_START, PERIOD_END).leaveDays).toBe(0);
  });

  it("ignores another person's events", () => {
    const events = [absence("p2", "2026-08-05", "vacation")];
    expect(computeShiftExpectationFactors(events, "p1", PERIOD_START, PERIOD_END).leaveDays).toBe(0);
  });

  it("never mutates the input events array", () => {
    const events = Object.freeze([absence("p1", "2026-08-05", "vacation")]);
    expect(() => computeShiftExpectationFactors(events, "p1", PERIOD_START, PERIOD_END)).not.toThrow();
  });
});
