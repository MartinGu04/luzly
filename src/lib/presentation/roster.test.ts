import { describe, expect, it } from "vitest";
import type { ManagerPersonSummary } from "@/lib/readModels/managerTypes";
import { classifyPersonnelType, classifyRegularRole, groupRosterHierarchy } from "./roster";

function person(overrides: Partial<ManagerPersonSummary> = {}): ManagerPersonSummary {
  return {
    id: "p1",
    name: "בדיקה בדיקה",
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

describe("classifyPersonnelType", () => {
  it('maps "קבע" to permanent', () => {
    expect(classifyPersonnelType("קבע")).toBe("permanent");
  });

  it('maps "חובה" to regular (סדיר)', () => {
    expect(classifyPersonnelType("חובה")).toBe("regular");
  });

  it('maps "מילואים" to reserve', () => {
    expect(classifyPersonnelType("מילואים")).toBe("reserve");
  });

  it("maps null to unclassified -- never drops the person", () => {
    expect(classifyPersonnelType(null)).toBe("unclassified");
  });

  it("maps an unrecognized value to unclassified, no fuzzy matching", () => {
    expect(classifyPersonnelType("משהו אחר")).toBe("unclassified");
  });

  it("trims and collapses whitespace before comparing", () => {
    expect(classifyPersonnelType("  קבע  ")).toBe("permanent");
    expect(classifyPersonnelType("חובה   ")).toBe("regular");
  });
});

describe("classifyRegularRole", () => {
  it("supervisor takes precedence even when also a technician -- one occurrence only", () => {
    expect(classifyRegularRole({ isSupervisor: true, isTechnician: true })).toBe("supervisor");
  });

  it("technician-only resolves to technician", () => {
    expect(classifyRegularRole({ isSupervisor: false, isTechnician: true })).toBe("technician");
  });

  it("neither flag resolves to other (אחרים)", () => {
    expect(classifyRegularRole({ isSupervisor: false, isTechnician: false })).toBe("other");
  });
});

describe("groupRosterHierarchy", () => {
  it("returns no groups for an empty roster", () => {
    expect(groupRosterHierarchy([])).toEqual([]);
  });

  it("never renders an empty top-level group", () => {
    const groups = groupRosterHierarchy([person({ id: "p1", personnelType: "קבע" })]);
    expect(groups.map((g) => g.group)).toEqual(["permanent"]);
  });

  it("orders top-level groups קבע, סדיר, מילואים, לא מסווג", () => {
    const groups = groupRosterHierarchy([
      person({ id: "p1", personnelType: null }),
      person({ id: "p2", personnelType: "מילואים" }),
      person({ id: "p3", personnelType: "חובה" }),
      person({ id: "p4", personnelType: "קבע" }),
    ]);
    expect(groups.map((g) => g.group)).toEqual(["permanent", "regular", "reserve", "unclassified"]);
  });

  it("קבע shows people directly, no subgroups", () => {
    const groups = groupRosterHierarchy([person({ id: "p1", personnelType: "קבע", name: "א" })]);
    expect(groups[0].people.map((p) => p.id)).toEqual(["p1"]);
    expect(groups[0].subgroups).toEqual([]);
  });

  it("מילואים shows people directly, no subgroups", () => {
    const groups = groupRosterHierarchy([person({ id: "p1", personnelType: "מילואים" })]);
    expect(groups[0].group).toBe("reserve");
    expect(groups[0].people.map((p) => p.id)).toEqual(["p1"]);
    expect(groups[0].subgroups).toEqual([]);
  });

  it("only סדיר subdivides into אחמ״שים/טכנאים/אחרים subgroups", () => {
    const groups = groupRosterHierarchy([
      person({ id: "p1", personnelType: "חובה", isSupervisor: true }),
      person({ id: "p2", personnelType: "חובה", isTechnician: true }),
      person({ id: "p3", personnelType: "חובה" }),
    ]);
    const regular = groups.find((g) => g.group === "regular")!;
    expect(regular.people).toEqual([]);
    expect(regular.subgroups.map((s) => s.group)).toEqual(["supervisor", "technician", "other"]);
    expect(regular.subgroups[0].people.map((p) => p.id)).toEqual(["p1"]);
    expect(regular.subgroups[1].people.map((p) => p.id)).toEqual(["p2"]);
    expect(regular.subgroups[2].people.map((p) => p.id)).toEqual(["p3"]);
  });

  it("a supervisor+technician person appears exactly once, under אחמ״שים", () => {
    const groups = groupRosterHierarchy([
      person({ id: "p1", personnelType: "חובה", isSupervisor: true, isTechnician: true }),
    ]);
    const regular = groups.find((g) => g.group === "regular")!;
    const allIds = regular.subgroups.flatMap((s) => s.people.map((p) => p.id));
    expect(allIds).toEqual(["p1"]);
  });

  it("never renders an empty סדיר subgroup", () => {
    const groups = groupRosterHierarchy([person({ id: "p1", personnelType: "חובה", isTechnician: true })]);
    const regular = groups.find((g) => g.group === "regular")!;
    expect(regular.subgroups.map((s) => s.group)).toEqual(["technician"]);
  });

  it("every person appears exactly once across the whole result, never duplicated", () => {
    const roster = [
      person({ id: "p1", personnelType: "קבע" }),
      person({ id: "p2", personnelType: "חובה", isSupervisor: true }),
      person({ id: "p3", personnelType: "חובה", isTechnician: true }),
      person({ id: "p4", personnelType: "חובה" }),
      person({ id: "p5", personnelType: "מילואים" }),
      person({ id: "p6", personnelType: null }),
    ];
    const groups = groupRosterHierarchy(roster);
    const allIds = groups.flatMap((g) => [...g.people.map((p) => p.id), ...g.subgroups.flatMap((s) => s.people.map((p) => p.id))]);
    expect(allIds.sort()).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
  });

  it("preserves the roster's own existing order within each group -- never re-sorts", () => {
    const groups = groupRosterHierarchy([
      person({ id: "p2", name: "ב", personnelType: "קבע" }),
      person({ id: "p1", name: "א", personnelType: "קבע" }),
    ]);
    expect(groups[0].people.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("is deterministic across repeated calls with the same input", () => {
    const roster = [
      person({ id: "p1", personnelType: "קבע" }),
      person({ id: "p2", personnelType: "חובה", isSupervisor: true }),
    ];
    expect(groupRosterHierarchy(roster)).toEqual(groupRosterHierarchy(roster));
  });
});
