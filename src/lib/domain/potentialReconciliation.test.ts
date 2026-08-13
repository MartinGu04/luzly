import { describe, expect, it } from "vitest";
import type { Event } from "./event";
import type { PotentialAllocation } from "./potentialAllocation";
import { reconcilePotentialAllocations, type ManagerRequirementStatus } from "./potentialReconciliation";

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function event(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_martin",
    personName: "מרטין בדיקה",
    date: "2026-08-23",
    title: "שומר 2",
    rawValue: "שומר 2",
    category: "duty",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: nextCell(),
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: "guard",
    absenceKind: null,
    ...overrides,
  };
}

function allocation(overrides: Partial<PotentialAllocation> = {}): PotentialAllocation {
  return {
    date: "2026-08-23",
    dutyFamily: "guard",
    slot: 2,
    sourceSlot: 2,
    columnLabel: "שומר 2",
    sourceAllocationLabel: "סייבר",
    resolvedSourcePersonId: null,
    sourceSheet: 'פוטנציאל תקש"אס 1-6/2026',
    sourceCell: nextCell(),
    ...overrides,
  };
}

describe("reconcilePotentialAllocations — exact-slot families (guard/reserve)", () => {
  it("guard: an exact matching internal slot is covered", () => {
    const [result] = reconcilePotentialAllocations(
      [allocation({ dutyFamily: "guard", slot: 2 })],
      [event({ dutyFamily: "guard", slot: 2 })],
    );
    expect(result.status).toBe("covered");
    expect(result.actualAssignees).toEqual([{ personId: "p_martin", personName: "מרטין בדיקה", certainty: "confirmed" }]);
  });

  it("guard: a wrong internal slot is missing", () => {
    const [result] = reconcilePotentialAllocations(
      [allocation({ dutyFamily: "guard", slot: 2 })],
      [event({ dutyFamily: "guard", slot: 3 })],
    );
    expect(result.status).toBe("missing");
    expect(result.actualAssignees).toEqual([]);
  });

  it("reserve: an exact matching internal slot is covered", () => {
    const [result] = reconcilePotentialAllocations(
      [allocation({ dutyFamily: "reserve", slot: 1, sourceSlot: 1, columnLabel: "עתודה 1" })],
      [event({ dutyFamily: "reserve", slot: 1 })],
    );
    expect(result.status).toBe("covered");
  });

  it("reserve: no matching internal Event is missing", () => {
    const [result] = reconcilePotentialAllocations(
      [allocation({ dutyFamily: "reserve", slot: 1, sourceSlot: 1, columnLabel: "עתודה 1" })],
      [],
    );
    expect(result.status).toBe("missing");
  });

  it("a different date never matches", () => {
    const [result] = reconcilePotentialAllocations(
      [allocation({ dutyFamily: "guard", slot: 2, date: "2026-08-23" })],
      [event({ dutyFamily: "guard", slot: 2, date: "2026-08-24" })],
    );
    expect(result.status).toBe("missing");
  });
});

describe("reconcilePotentialAllocations — evacuation_on_call (single, unslotted)", () => {
  it("covered when a matching internal Event exists", () => {
    const [result] = reconcilePotentialAllocations(
      [allocation({ dutyFamily: "evacuation_on_call", slot: null, sourceSlot: null, columnLabel: "כונן פינויים" })],
      [event({ dutyFamily: "evacuation_on_call", slot: null })],
    );
    expect(result.status).toBe("covered");
  });

  it("missing when no matching internal Event exists", () => {
    const [result] = reconcilePotentialAllocations(
      [allocation({ dutyFamily: "evacuation_on_call", slot: null, sourceSlot: null, columnLabel: "כונן פינויים" })],
      [],
    );
    expect(result.status).toBe("missing");
  });
});

describe("reconcilePotentialAllocations — multiplicity families (oxid/kitchen/rasar)", () => {
  it("3 Potential oxid requirements vs 3 internal oxid Events -> all covered", () => {
    const allocations = [1, 2, 3].map((n) =>
      allocation({ dutyFamily: "oxid", slot: null, sourceSlot: n, columnLabel: `אוקסיד ${n}` }),
    );
    const events = ["p_a", "p_b", "p_c"].map((personId) => event({ dutyFamily: "oxid", slot: null, personId }));
    const results = reconcilePotentialAllocations(allocations, events);
    expect(results.every((r) => r.status === "covered")).toBe(true);
  });

  it("3 Potential oxid vs 2 internal -> exactly 2 covered, 1 missing", () => {
    const allocations = [1, 2, 3].map((n) =>
      allocation({ dutyFamily: "oxid", slot: null, sourceSlot: n, columnLabel: `אוקסיד ${n}` }),
    );
    const events = ["p_a", "p_b"].map((personId) => event({ dutyFamily: "oxid", slot: null, personId }));
    const results = reconcilePotentialAllocations(allocations, events);
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === "covered")).toHaveLength(2);
    expect(statuses.filter((s) => s === "missing")).toHaveLength(1);
  });

  it("daily_kitchen multiplicity: 2 vs 1 -> 1 covered, 1 missing", () => {
    const allocations = [1, 2].map((n) =>
      allocation({ dutyFamily: "daily_kitchen", slot: null, sourceSlot: n, columnLabel: `מטבח יומי ${n}` }),
    );
    const results = reconcilePotentialAllocations(allocations, [
      event({ dutyFamily: "daily_kitchen", slot: null, personId: "p_a" }),
    ]);
    expect(results.filter((r) => r.status === "covered")).toHaveLength(1);
    expect(results.filter((r) => r.status === "missing")).toHaveLength(1);
  });

  it("full_kitchen multiplicity: 3 vs 3 -> all covered", () => {
    const allocations = [1, 2, 3].map((n) =>
      allocation({ dutyFamily: "full_kitchen", slot: null, sourceSlot: n, columnLabel: `מטבח מלא ${n}` }),
    );
    const events = ["p_a", "p_b", "p_c"].map((personId) =>
      event({ dutyFamily: "full_kitchen", slot: null, personId }),
    );
    const results = reconcilePotentialAllocations(allocations, events);
    expect(results.every((r) => r.status === "covered")).toBe(true);
  });

  it('rasar multiplicity: 2 vs 0 -> both missing', () => {
    const allocations = [1, 2].map((n) =>
      allocation({ dutyFamily: "rasar", slot: null, sourceSlot: n, columnLabel: `רס"ר ${n}` }),
    );
    const results = reconcilePotentialAllocations(allocations, []);
    expect(results.every((r) => r.status === "missing")).toBe(true);
  });

  it("pairing is deterministic regardless of input event order", () => {
    const allocations = [1, 2].map((n) =>
      allocation({ dutyFamily: "oxid", slot: null, sourceSlot: n, columnLabel: `אוקסיד ${n}` }),
    );
    const eventA = event({ dutyFamily: "oxid", slot: null, personId: "p_a", sourceCell: "X1" });
    const eventB = event({ dutyFamily: "oxid", slot: null, personId: "p_b", sourceCell: "X2" });
    const forward = reconcilePotentialAllocations(allocations, [eventA, eventB]);
    const reversed = reconcilePotentialAllocations(allocations, [eventB, eventA]);
    expect(forward.map((r) => r.actualAssignees[0]?.personId)).toEqual(
      reversed.map((r) => r.actualAssignees[0]?.personId),
    );
  });

  it("pairing is deterministic regardless of input allocation order", () => {
    const allocA = allocation({ dutyFamily: "oxid", slot: null, sourceSlot: 1, columnLabel: "אוקסיד 1" });
    const allocB = allocation({ dutyFamily: "oxid", slot: null, sourceSlot: 2, columnLabel: "אוקסיד 2" });
    const events = ["p_a"].map((personId) => event({ dutyFamily: "oxid", slot: null, personId }));
    const forward = reconcilePotentialAllocations([allocA, allocB], events);
    const reversed = reconcilePotentialAllocations([allocB, allocA], events);
    // Same requirement (by sourceCell) gets the same result regardless of array position.
    const forwardByCell = new Map(forward.map((r, i) => [[allocA, allocB][i].sourceCell, r.status]));
    const reversedByCell = new Map(reversed.map((r, i) => [[allocB, allocA][i].sourceCell, r.status]));
    expect(forwardByCell.get(allocA.sourceCell)).toBe(reversedByCell.get(allocA.sourceCell));
    expect(forwardByCell.get(allocB.sourceCell)).toBe(reversedByCell.get(allocB.sourceCell));
  });
});

describe("reconcilePotentialAllocations — organizational source labels reconcile structurally", () => {
  it("an organizational/source label (no resolved person) still reconciles by date+requirement, never left as not_evaluable", () => {
    const [result] = reconcilePotentialAllocations(
      [allocation({ dutyFamily: "guard", slot: 1, sourceSlot: 1, columnLabel: "שומר 1", sourceAllocationLabel: "סייבר", resolvedSourcePersonId: null })],
      [event({ dutyFamily: "guard", slot: 1, personId: "p_x", personName: "מישהו אחר" })],
    );
    expect(result.status).toBe("covered");
    expect(result.actualAssignees[0].personName).toBe("מישהו אחר");
  });
});

describe("reconcilePotentialAllocations — named-source conflict (§10/§15)", () => {
  it("a named source person with a blocking absence produces a source conflict, independent of coverage", () => {
    const alloc = allocation({
      dutyFamily: "guard",
      slot: 2,
      resolvedSourcePersonId: "p_martin",
      sourceAllocationLabel: "מרטין בדיקה",
    });
    const events = [
      event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind: "vacation", dutyFamily: null }),
    ];
    const [result] = reconcilePotentialAllocations([alloc], events);
    expect(result.sourceConflict).toBe("blocking_absence");
  });

  it("source conflict + a replacement actual assignee -> covered AND conflict both surfaced", () => {
    const alloc = allocation({
      dutyFamily: "guard",
      slot: 2,
      resolvedSourcePersonId: "p_martin",
      sourceAllocationLabel: "מרטין בדיקה",
    });
    const events = [
      event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind: "vacation", dutyFamily: null }),
      event({ personId: "p_eitan", personName: "איתן דוגמה", dutyFamily: "guard", slot: 2 }),
    ];
    const [result] = reconcilePotentialAllocations([alloc], events);
    expect(result.status).toBe("covered");
    expect(result.sourceConflict).toBe("blocking_absence");
    expect(result.actualAssignees[0].personName).toBe("איתן דוגמה");
  });

  it("no conflict when the named source person has no blocking absence", () => {
    const alloc = allocation({ dutyFamily: "guard", slot: 2, resolvedSourcePersonId: "p_martin" });
    const [result] = reconcilePotentialAllocations([alloc], [event({ dutyFamily: "guard", slot: 2 })]);
    expect(result.sourceConflict).toBeNull();
  });

  it("no conflict for a non-blocking absence kind ('after')", () => {
    const alloc = allocation({ dutyFamily: "guard", slot: 2, resolvedSourcePersonId: "p_martin" });
    const events = [
      event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind: "after", dutyFamily: null }),
    ];
    const [result] = reconcilePotentialAllocations([alloc], events);
    expect(result.sourceConflict).toBeNull();
  });

  it("no conflict when resolvedSourcePersonId is null (organizational label)", () => {
    const alloc = allocation({ dutyFamily: "guard", slot: 2, resolvedSourcePersonId: null });
    const events = [
      event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind: "vacation", dutyFamily: null }),
    ];
    const [result] = reconcilePotentialAllocations([alloc], events);
    expect(result.sourceConflict).toBeNull();
  });

  it("no fuzzy identity matching -- a name that merely resembles a known person is never treated as one here", () => {
    // resolvedSourcePersonId is the parser's job; reconciliation trusts it as-is and never re-derives identity from sourceAllocationLabel text.
    const alloc = allocation({
      dutyFamily: "guard",
      slot: 2,
      resolvedSourcePersonId: null,
      sourceAllocationLabel: "מרטין בדיקה",
    });
    const events = [
      event({ personId: "p_martin", date: "2026-08-23", category: "absence", absenceKind: "vacation", dutyFamily: null }),
    ];
    const [result] = reconcilePotentialAllocations([alloc], events);
    expect(result.sourceConflict).toBeNull();
  });
});

describe("reconcilePotentialAllocations — batch ordering", () => {
  it("preserves the input allocation order in the output", () => {
    const allocA = allocation({ columnLabel: "a", sourceSlot: 1 });
    const allocB = allocation({ columnLabel: "b", sourceSlot: 2, dutyFamily: "oxid", slot: null });
    const results = reconcilePotentialAllocations([allocA, allocB], []);
    expect(results.map((r) => r.columnLabel)).toEqual(["a", "b"]);
  });
});

describe("reconcilePotentialAllocations — cross-sheet identity (H1/H2 can share A1 cell references)", () => {
  it("H1 C2 and H2 C2 never collide, even sharing the exact same sourceCell text", () => {
    const h1Allocation = allocation({
      sourceSheet: 'פוטנציאל תקש"אס 1-6/2026',
      sourceCell: "C2",
      date: "2026-06-15",
      dutyFamily: "guard",
      slot: 1,
      columnLabel: "שומר 1",
      sourceAllocationLabel: "סייבר H1",
    });
    const h2Allocation = allocation({
      sourceSheet: 'פוטנציאל תקש"אס 7-12/2026',
      sourceCell: "C2",
      date: "2026-07-15",
      dutyFamily: "reserve",
      slot: 1,
      sourceSlot: 1,
      columnLabel: "עתודה 1",
      sourceAllocationLabel: "סייבר H2",
    });
    const events = [
      event({ personId: "p_martin", personName: "מרטין בדיקה", date: "2026-06-15", dutyFamily: "guard", slot: 1 }),
      // No matching internal reserve Event for the H2 allocation -- it should end up "missing".
    ];

    const results = reconcilePotentialAllocations([h1Allocation, h2Allocation], events);

    expect(results).toHaveLength(2);
    const [h1Result, h2Result] = results;

    expect(h1Result.date).toBe("2026-06-15");
    expect(h1Result.dutyFamily).toBe("guard");
    expect(h1Result.columnLabel).toBe("שומר 1");
    expect(h1Result.sourceAllocationLabel).toBe("סייבר H1");
    expect(h1Result.status).toBe("covered");
    expect(h1Result.actualAssignees).toEqual([{ personId: "p_martin", personName: "מרטין בדיקה", certainty: "confirmed" }]);

    expect(h2Result.date).toBe("2026-07-15");
    expect(h2Result.dutyFamily).toBe("reserve");
    expect(h2Result.columnLabel).toBe("עתודה 1");
    expect(h2Result.sourceAllocationLabel).toBe("סייבר H2");
    expect(h2Result.status).toBe("missing");
    expect(h2Result.actualAssignees).toEqual([]);

    // Input order preserved.
    expect(results.map((r) => r.sourceAllocationLabel)).toEqual(["סייבר H1", "סייבר H2"]);
  });

  it("a shared sourceCell across sheets never leaks one allocation's actualAssignees into the other's result", () => {
    const h1Allocation = allocation({
      sourceSheet: 'פוטנציאל תקש"אס 1-6/2026',
      sourceCell: "D5",
      date: "2026-06-20",
      dutyFamily: "oxid",
      slot: null,
      sourceSlot: 1,
      columnLabel: "אוקסיד 1",
    });
    const h2Allocation = allocation({
      sourceSheet: 'פוטנציאל תקש"אס 7-12/2026',
      sourceCell: "D5",
      date: "2026-08-20",
      dutyFamily: "oxid",
      slot: null,
      sourceSlot: 1,
      columnLabel: "אוקסיד 1",
    });
    const events = [
      event({ personId: "p_only_h1", personName: "רק ב-H1", date: "2026-06-20", dutyFamily: "oxid", slot: null }),
    ];

    const [h1Result, h2Result] = reconcilePotentialAllocations([h1Allocation, h2Allocation], events);

    expect(h1Result.status).toBe("covered");
    expect(h1Result.actualAssignees[0]?.personId).toBe("p_only_h1");
    expect(h2Result.status).toBe("missing");
    expect(h2Result.actualAssignees).toEqual([]);
  });
});

describe("ManagerRequirementStatus — forward compatibility", () => {
  it("partial remains a valid literal state of the type, even though this domain doesn't produce it today", () => {
    const partial: ManagerRequirementStatus = "partial";
    expect(partial).toBe("partial");
  });
});
