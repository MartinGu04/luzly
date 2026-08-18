import { describe, expect, it } from "vitest";
import type { ManagerAbsenceRowView, ManagerDutyRowView } from "@/components/manager/types";
import { groupManagerAbsences, groupManagerDuties } from "./dutyAbsenceGrouping";

function duty(overrides: Partial<ManagerDutyRowView> = {}): ManagerDutyRowView {
  return {
    key: "k1",
    personName: "מרטין בדיקה",
    dateLabel: "היום",
    emoji: "🛡️",
    title: "שמירה 1",
    dutyFamily: "guard",
    ...overrides,
  };
}

function absence(overrides: Partial<ManagerAbsenceRowView> = {}): ManagerAbsenceRowView {
  return {
    key: "k1",
    personName: "מרטין בדיקה",
    dateLabel: "היום",
    emoji: "🏖️",
    label: "חופש",
    absenceKind: "vacation",
    ...overrides,
  };
}

describe("groupManagerDuties", () => {
  it("returns no groups for an empty list", () => {
    expect(groupManagerDuties([])).toEqual([]);
  });

  it("groups the same dutyFamily together even with different slot numbers (שמירה 1 / שמירה 2)", () => {
    const groups = groupManagerDuties([
      duty({ key: "a", title: "שמירה 1", dutyFamily: "guard" }),
      duty({ key: "b", title: "שמירה 2", dutyFamily: "guard" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("guard");
    expect(groups[0].rows.map((r) => r.key)).toEqual(["a", "b"]);
  });

  it("keeps different families in separate groups", () => {
    const groups = groupManagerDuties([
      duty({ key: "a", dutyFamily: "guard" }),
      duty({ key: "b", dutyFamily: "oxid" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["guard", "oxid"]);
  });

  it("never renders an empty group", () => {
    const groups = groupManagerDuties([duty({ dutyFamily: "guard" })]);
    expect(groups).toHaveLength(1);
    expect(groups.every((g) => g.rows.length > 0)).toBe(true);
  });

  it("uses a fixed deterministic family order, not appearance order", () => {
    const groups = groupManagerDuties([
      duty({ key: "a", dutyFamily: "oxid" }),
      duty({ key: "b", dutyFamily: "guard" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["guard", "oxid"]);
  });

  it("each group carries a label and emoji, and preserves row order within it", () => {
    const groups = groupManagerDuties([
      duty({ key: "a", personName: "א", dutyFamily: "guard" }),
      duty({ key: "b", personName: "ב", dutyFamily: "guard" }),
    ]);
    expect(groups[0].label).toBe("שמירה");
    expect(groups[0].emoji).toBe("💂");
    expect(groups[0].rows.map((r) => r.personName)).toEqual(["א", "ב"]);
  });
});

describe("groupManagerAbsences", () => {
  it("returns no groups for an empty list", () => {
    expect(groupManagerAbsences([])).toEqual([]);
  });

  it("groups by absenceKind", () => {
    const groups = groupManagerAbsences([
      absence({ key: "a", absenceKind: "vacation" }),
      absence({ key: "b", absenceKind: "vacation" }),
      absence({ key: "c", absenceKind: "medical" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["vacation", "medical"]);
    expect(groups[0].rows.map((r) => r.key)).toEqual(["a", "b"]);
  });

  it("never renders an empty group", () => {
    const groups = groupManagerAbsences([absence({ absenceKind: "day_off" })]);
    expect(groups).toHaveLength(1);
  });

  it("uses a fixed deterministic kind order", () => {
    const groups = groupManagerAbsences([
      absence({ key: "a", absenceKind: "after" }),
      absence({ key: "b", absenceKind: "vacation" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["vacation", "after"]);
  });

  it("each group carries a Hebrew label", () => {
    const groups = groupManagerAbsences([absence({ absenceKind: "medical" })]);
    expect(groups[0].label).toBe("גימלים");
  });
});
