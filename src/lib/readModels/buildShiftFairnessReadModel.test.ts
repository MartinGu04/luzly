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
  });
});
