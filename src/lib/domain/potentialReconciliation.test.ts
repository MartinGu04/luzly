import { describe, expect, it } from "vitest";
import type { Event } from "./event";
import {
  reconcilePotentialAllocation,
  reconcilePotentialAllocations,
  type ManagerRequirementStatus,
  type ReconcilableAllocation,
} from "./potentialReconciliation";

function event(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_martin",
    personName: "מרטין בדיקה",
    date: "2026-08-23",
    title: "חופש",
    rawValue: "חופש",
    category: "absence",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: "B2",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: null,
    absenceKind: "vacation",
    ...overrides,
  };
}

function allocation(overrides: Partial<ReconcilableAllocation> = {}): ReconcilableAllocation {
  return {
    date: "2026-08-23",
    columnLabel: "כונן פינויים",
    rawValue: "מרטין בדיקה",
    resolvedPersonId: "p_martin",
    ...overrides,
  };
}

describe("reconcilePotentialAllocation — organizational/source labels", () => {
  it("an organizational label (no resolved person) is always not_evaluable", () => {
    const result = reconcilePotentialAllocation(
      allocation({ resolvedPersonId: null, rawValue: "יחידה א" }),
      [],
    );
    expect(result.status).toBe("not_evaluable");
    expect(result.namedPersonBlockingAbsence).toBe(false);
    expect(result.resolvedPersonId).toBeNull();
  });

  it("a label is never treated as a person even if internal events exist that date", () => {
    const result = reconcilePotentialAllocation(
      allocation({ resolvedPersonId: null, rawValue: "יחידה א" }),
      [event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind: "vacation" })],
    );
    expect(result.status).toBe("not_evaluable");
  });
});

describe("reconcilePotentialAllocation — named-person conflict (§15)", () => {
  it("a blocking absence on the same date produces the deterministic conflict: missing", () => {
    const result = reconcilePotentialAllocation(allocation(), [
      event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind: "vacation" }),
    ]);
    expect(result.status).toBe("missing");
    expect(result.namedPersonBlockingAbsence).toBe(true);
  });

  it("every blocking absence kind triggers the conflict", () => {
    for (const absenceKind of ["vacation", "abroad", "medical", "day_off"] as const) {
      const result = reconcilePotentialAllocation(allocation(), [
        event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind }),
      ]);
      expect(result.status).toBe("missing");
    }
  });

  it("the non-blocking 'after' absence kind does NOT trigger the conflict", () => {
    const result = reconcilePotentialAllocation(allocation(), [
      event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind: "after" }),
    ]);
    expect(result.status).toBe("not_evaluable");
    expect(result.namedPersonBlockingAbsence).toBe(false);
  });

  it("an absence on a DIFFERENT date never triggers the conflict", () => {
    const result = reconcilePotentialAllocation(allocation({ date: "2026-08-23" }), [
      event({ personId: "p_martin", date: "2026-08-24", category: "absence", absenceKind: "vacation" }),
    ]);
    expect(result.status).toBe("not_evaluable");
  });

  it("a blocking absence for a DIFFERENT person never triggers the conflict", () => {
    const result = reconcilePotentialAllocation(allocation({ resolvedPersonId: "p_martin" }), [
      event({ personId: "p_other", date: "2026-08-23", category: "absence", absenceKind: "vacation" }),
    ]);
    expect(result.status).toBe("not_evaluable");
  });
});

describe("reconcilePotentialAllocation — named person, no fabricated coverage", () => {
  it("a named person with a normal internal shift that date is still not_evaluable (never guessed as covered)", () => {
    const result = reconcilePotentialAllocation(allocation(), [
      event({
        personId: "p_martin",
        date: "2026-08-23",
        category: "shift",
        role: "technician",
        period: "day",
        absenceKind: null,
        title: 'טכנאי יום',
        rawValue: 'טכנאי יום',
      }),
    ]);
    expect(result.status).toBe("not_evaluable");
    expect(result.namedPersonBlockingAbsence).toBe(false);
  });

  it("a named person with NO internal events at all that date is not_evaluable, never 'missing' without absence evidence", () => {
    const result = reconcilePotentialAllocation(allocation(), []);
    expect(result.status).toBe("not_evaluable");
  });
});

describe("reconcilePotentialAllocation — no fuzzy matching", () => {
  it("reconciliation itself never re-derives identity from text -- only resolvedPersonId decides", () => {
    // Even though rawValue looks like it could be a person, resolvedPersonId is null (the parser's job to set it) -> not_evaluable, no matter what internal events exist.
    const result = reconcilePotentialAllocation(
      allocation({ resolvedPersonId: null, rawValue: "מרטין בדיקה" }),
      [event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind: "vacation" })],
    );
    expect(result.status).toBe("not_evaluable");
  });
});

describe("reconcilePotentialAllocations — batch", () => {
  it("preserves multiple requirements on the same date, distinctly", () => {
    const allocations = [
      allocation({ columnLabel: "כונן פינויים", resolvedPersonId: "p_martin" }),
      allocation({ columnLabel: "מטבח", resolvedPersonId: null, rawValue: "יחידה ב" }),
    ];
    const results = reconcilePotentialAllocations(allocations, [
      event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind: "vacation" }),
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ columnLabel: "כונן פינויים", status: "missing" });
    expect(results[1]).toMatchObject({ columnLabel: "מטבח", status: "not_evaluable" });
  });

  it("batch reconciliation is a simple map: order preserved, no cross-item leakage", () => {
    const allocations = [allocation({ columnLabel: "a" }), allocation({ columnLabel: "b" })];
    const results = reconcilePotentialAllocations(allocations, []);
    expect(results.map((r) => r.columnLabel)).toEqual(["a", "b"]);
    expect(results.every((r) => r.status === "not_evaluable")).toBe(true);
  });
});

describe("ManagerRequirementStatus — forward compatibility", () => {
  it("covered/partial remain valid literal states of the type, even though this domain doesn't produce them yet", () => {
    const covered: ManagerRequirementStatus = "covered";
    const partial: ManagerRequirementStatus = "partial";
    expect(covered).toBe("covered");
    expect(partial).toBe("partial");
  });
});
