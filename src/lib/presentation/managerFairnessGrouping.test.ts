import { describe, expect, it } from "vitest";
import type { ManagerFairnessRowCardView } from "@/components/manager/fairness/types";
import { groupManagerFairnessRows } from "./managerFairnessGrouping";

function row(overrides: Partial<ManagerFairnessRowCardView> = {}): ManagerFairnessRowCardView {
  return {
    key: "k1",
    sourceName: "מרטין בדיקה",
    href: "/manager/fairness?person=p1",
    allocationLabel: "טכנאי",
    previousLabel: "5",
    currentLabel: "6",
    deltaLabel: "+1",
    isDeltaNew: false,
    targetLabel: "8",
    gapLabel: "-2",
    weekendLabel: "3",
    exemptionBadges: [],
    ...overrides,
  };
}

describe("groupManagerFairnessRows", () => {
  it("returns no groups for an empty list", () => {
    expect(groupManagerFairnessRows([])).toEqual([]);
  });

  it('groups exact "אחמ"ש" rows under אחמ״שים', () => {
    const groups = groupManagerFairnessRows([row({ allocationLabel: 'אחמ"ש' })]);
    expect(groups.map((g) => g.key)).toEqual(["supervisor"]);
    expect(groups[0].label).toBe("אחמ״שים");
  });

  it('groups exact "טכנאי" rows under טכנאים', () => {
    const groups = groupManagerFairnessRows([row({ allocationLabel: "טכנאי" })]);
    expect(groups.map((g) => g.key)).toEqual(["technician"]);
  });

  it('ר"צ, הסמכה, and unresolved labels all stay in אחרים -- never guessed', () => {
    const groups = groupManagerFairnessRows([
      row({ key: "a", allocationLabel: 'ר"צ' }),
      row({ key: "b", allocationLabel: "הסמכה" }),
      row({ key: "c", allocationLabel: "משהו לא ידוע" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["other"]);
    expect(groups[0].rows.map((r) => r.key)).toEqual(["a", "b", "c"]);
  });

  it("orders groups אחמ״שים, טכנאים, אחרים", () => {
    const groups = groupManagerFairnessRows([
      row({ key: "a", allocationLabel: "הסמכה" }),
      row({ key: "b", allocationLabel: "טכנאי" }),
      row({ key: "c", allocationLabel: 'אחמ"ש' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["supervisor", "technician", "other"]);
  });

  it("never renders an empty group", () => {
    const groups = groupManagerFairnessRows([row({ allocationLabel: "טכנאי" })]);
    expect(groups.every((g) => g.rows.length > 0)).toBe(true);
    expect(groups).toHaveLength(1);
  });

  it("preserves the existing read-model row order within each group -- never re-sorts alphabetically or by score", () => {
    const groups = groupManagerFairnessRows([
      row({ key: "z_last", sourceName: "ז אחרון", allocationLabel: "טכנאי" }),
      row({ key: "a_first", sourceName: "א ראשון", allocationLabel: "טכנאי" }),
    ]);
    expect(groups[0].rows.map((r) => r.key)).toEqual(["z_last", "a_first"]);
  });
});
