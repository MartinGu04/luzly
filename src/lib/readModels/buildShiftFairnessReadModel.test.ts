import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import type { Person } from "@/lib/domain/types";
import { buildShiftFairnessReadModel } from "./buildShiftFairnessReadModel";

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

function shiftEvent(overrides: Partial<Event> & { personId: string; date: string }): Event {
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

describe("buildShiftFairnessReadModel", () => {
  it("builds both comparison groups, resolves names, and reports period metadata", () => {
    const tech = person({ id: "p_tech", name: "טל טכנאי", isTechnician: true });
    const sup = person({ id: "p_sup", name: "שירה אחמ״ש", isSupervisor: true });
    const now: LocalNow = { date: "2026-08-15", minuteOfDay: 600 };

    const events: Event[] = [
      shiftEvent({ personId: tech.id, date: "2026-08-05", role: "technician" }),
      shiftEvent({ personId: sup.id, date: "2026-08-05", role: "supervisor" }),
    ];

    const model = buildShiftFairnessReadModel([tech, sup], events, { year: 2026, month: 8 }, now, "2026-08-15T10:00:00.000Z");

    expect(model.month).toBe("2026-08");
    expect(model.periodStartDate).toBe("2026-08-01");
    expect(model.periodEndDate).toBe("2026-08-15");
    expect(model.periodStatus).toBe("current");
    expect(model.groups).toHaveLength(2);

    const supervisorGroup = model.groups.find((group) => group.role === "supervisor");
    const technicianGroup = model.groups.find((group) => group.role === "technician");
    expect(supervisorGroup?.rows).toHaveLength(1);
    expect(technicianGroup?.rows).toHaveLength(1);
    expect(supervisorGroup?.rows[0].personName).toBe("שירה אחמ״ש");
    expect(technicianGroup?.rows[0].personName).toBe("טל טכנאי");
  });

  it("resolves each row's serviceCategory from the person's own personnelType, for the read-model's UI-safe presentation subgrouping (PR #51 follow-up) -- never a raw roster lookup downstream", () => {
    const permanent = person({ id: "p_perm", isTechnician: true, personnelType: "קבע" });
    const reserve = person({ id: "p_res", isTechnician: true, personnelType: "מילואים" });
    const unclassified = person({ id: "p_unk", isTechnician: true, personnelType: "לא ברור" });
    const now: LocalNow = { date: "2026-08-15", minuteOfDay: 600 };

    const model = buildShiftFairnessReadModel(
      [permanent, reserve, unclassified],
      [],
      { year: 2026, month: 8 },
      now,
      "2026-08-15T10:00:00.000Z",
    );

    const technicianGroup = model.groups.find((group) => group.role === "technician");
    const byId = new Map(technicianGroup?.rows.map((row) => [row.personId, row.serviceCategory]));
    expect(byId.get("p_perm")).toBe("permanent");
    expect(byId.get("p_res")).toBe("reserve");
    expect(byId.get("p_unk")).toBe("unclassified");
  });

  it("a wholly future month reports null period bounds and empty-but-present groups", () => {
    const tech = person({ id: "p_tech", isTechnician: true });
    const now: LocalNow = { date: "2026-08-15", minuteOfDay: 600 };

    const model = buildShiftFairnessReadModel([tech], [], { year: 2026, month: 9 }, now, "2026-08-15T10:00:00.000Z");

    expect(model.periodStartDate).toBeNull();
    expect(model.periodEndDate).toBeNull();
    expect(model.periodStatus).toBe("current");
    const technicianGroup = model.groups.find((group) => group.role === "technician");
    expect(technicianGroup?.rows).toHaveLength(1);
    expect(technicianGroup?.rows[0].actualShifts).toBe(0);
  });

  it("a closed historical month reports periodStatus: closed and produces null historical targets without dated evidence -- periodStatus is genuinely threaded into the engine, not silently dropped", () => {
    const tech = person({ id: "p_tech", isTechnician: true });
    const now: LocalNow = { date: "2026-08-15", minuteOfDay: 600 };

    const events: Event[] = [shiftEvent({ personId: tech.id, date: "2026-06-05", role: "technician" })];

    const model = buildShiftFairnessReadModel([tech], events, { year: 2026, month: 6 }, now, "2026-08-15T10:00:00.000Z");

    expect(model.periodStatus).toBe("closed");
    const technicianGroup = model.groups.find((group) => group.role === "technician");
    const row = technicianGroup?.rows[0];
    expect(row?.actualShifts).toBe(1);
    // Current capability alone must not fabricate a historical target once
    // this reaches the read-model layer either -- see
    // fairnessShiftEngine.ts's historical qualification audit.
    expect(row?.target).toBeNull();
    expect(row?.status).toBeNull();
    expect(row?.dataCompleteness.reasons).toContain("shift_target_unmodelable_historical");
    // No target -> nothing to explain either.
    expect(row?.expectationFactors).toBeNull();
  });

  it("reports a modelable member's expectationFactors from real absence/constraint Events within the same period the target itself covers", () => {
    const tech = person({ id: "p_tech", isTechnician: true });
    const now: LocalNow = { date: "2026-08-15", minuteOfDay: 600 };

    const events: Event[] = [
      shiftEvent({ personId: tech.id, date: "2026-08-05", role: "technician" }),
      shiftEvent({
        personId: tech.id,
        date: "2026-08-06",
        category: "absence",
        absenceKind: "vacation",
        title: "חופש",
        rawValue: "חופש",
      }),
      shiftEvent({
        personId: tech.id,
        date: "2026-08-07",
        category: "constraint",
        title: "אילוץ",
        rawValue: "אילוץ",
      }),
    ];

    const model = buildShiftFairnessReadModel([tech], events, { year: 2026, month: 8 }, now, "2026-08-15T10:00:00.000Z");
    const row = model.groups.find((group) => group.role === "technician")?.rows[0];

    expect(row?.target).not.toBeNull();
    expect(row?.expectationFactors).toEqual({ leaveDays: 1, constraintDays: 1, referralDays: 0 });
  });
});

describe("buildShiftFairnessReadModel — integration: future scheduled shifts never reach the final read model as completed work", () => {
  // End-to-end proof through the SAME public entry point `loadShiftFairnessReadModel`
  // (src/lib/readModels/shiftFairness.ts) calls in production -- not just the
  // internal engine function. "Today" is fixed to 2026-08-23; two shifts are
  // already entered on the sheet (CONFIRMED, no "?") for 08-24 and 08-25 --
  // days that have not happened yet.
  const now: LocalNow = { date: "2026-08-23", minuteOfDay: 600 };
  const month = { year: 2026, month: 8 };

  it("a person's own actualShifts on the final ShiftFairnessReadModel excludes their already-entered future-dated confirmed shifts", () => {
    const leia = person({ id: "p_leia", name: "לאה טכנאית", isTechnician: true });

    const pastShiftDates = ["2026-08-03", "2026-08-05", "2026-08-08", "2026-08-10", "2026-08-12", "2026-08-15"];
    const events: Event[] = [
      ...pastShiftDates.map((date) => shiftEvent({ personId: leia.id, date, role: "technician" })),
      shiftEvent({ personId: leia.id, date: "2026-08-24", role: "technician" }), // tomorrow
      shiftEvent({ personId: leia.id, date: "2026-08-25", role: "technician" }), // day after
    ];

    const model = buildShiftFairnessReadModel([leia], events, month, now, "2026-08-23T10:00:00.000Z");
    const row = model.groups.find((group) => group.role === "technician")?.rows[0];

    expect(model.periodEndDate).toBe("2026-08-23");
    // 6 real past shifts -- NEVER 8, even though 8 confirmed rows exist for
    // her in the raw event feed.
    expect(row?.actualShifts).toBe(6);
  });

  it("a future-dated shift belonging to one group member never inflates the group totals another member's own expected share is computed from", () => {
    const leia = person({ id: "p_leia", name: "לאה טכנאית", isTechnician: true });
    const noa = person({ id: "p_noa", name: "נועה טכנאית", isTechnician: true });

    const baseEvents: Event[] = [
      shiftEvent({ personId: leia.id, date: "2026-08-03", role: "technician" }),
      shiftEvent({ personId: leia.id, date: "2026-08-05", role: "technician" }),
      shiftEvent({ personId: noa.id, date: "2026-08-04", role: "technician" }),
    ];
    const leiaFutureShift = shiftEvent({ personId: leia.id, date: "2026-08-25", role: "technician" });

    const modelWithFuture = buildShiftFairnessReadModel(
      [leia, noa],
      [...baseEvents, leiaFutureShift],
      month,
      now,
      "2026-08-23T10:00:00.000Z",
    );
    const modelWithoutFuture = buildShiftFairnessReadModel([leia, noa], baseEvents, month, now, "2026-08-23T10:00:00.000Z");

    const noaTargetWithFuture = modelWithFuture.groups.find((g) => g.role === "technician")?.rows.find((r) => r.personId === noa.id)
      ?.target;
    const noaTargetWithoutFuture = modelWithoutFuture.groups
      .find((g) => g.role === "technician")
      ?.rows.find((r) => r.personId === noa.id)?.target;

    // Noa's expected share must be IDENTICAL whether or not Leia's
    // future-dated shift exists in the raw feed -- proving it never reaches
    // the group totals the final read model's `target` field is built from.
    expect(noaTargetWithFuture).toBe(noaTargetWithoutFuture);
    expect(
      modelWithFuture.groups.find((g) => g.role === "technician")?.rows.find((r) => r.personId === leia.id)?.actualShifts,
    ).toBe(2);
  });
});

describe("buildShiftFairnessReadModel — integration: weekendsWorked counts distinct Thu-Sat blocks, not weekend shift-slots", () => {
  it("real-world regression: Aug 6-8 + Aug 20-22, 'today' = Aug 23 2026 -> weekendsWorked = 2 on the final read model row", () => {
    const leia = person({ id: "p_leia", name: "לאה טכנאית", isTechnician: true });
    const now: LocalNow = { date: "2026-08-23", minuteOfDay: 600 };
    const month = { year: 2026, month: 8 };

    const events: Event[] = [
      shiftEvent({ personId: leia.id, date: "2026-08-06", role: "technician" }),
      shiftEvent({ personId: leia.id, date: "2026-08-07", role: "technician" }),
      shiftEvent({ personId: leia.id, date: "2026-08-08", role: "technician" }),
      shiftEvent({ personId: leia.id, date: "2026-08-20", role: "technician" }),
      shiftEvent({ personId: leia.id, date: "2026-08-21", role: "technician" }),
      shiftEvent({ personId: leia.id, date: "2026-08-22", role: "technician" }),
    ];

    const model = buildShiftFairnessReadModel([leia], events, month, now, "2026-08-23T10:00:00.000Z");
    const row = model.groups.find((group) => group.role === "technician")?.rows[0];

    expect(row?.weekendsWorked).toBe(2);
    // A DIFFERENT, still-correct fact -- 6 real weekend shift-slots -- kept
    // exactly as before, since weekendTarget/weekendDeviation/weekendStatus
    // still derive from it, unchanged by this fix.
    expect(row?.weekendActualShifts).toBe(6);
  });
});
