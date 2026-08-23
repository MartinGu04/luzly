import { describe, expect, it } from "vitest";
import type { ShiftFairnessCardView } from "./fairnessCards";
import { groupShiftFairnessCardsByServiceType } from "./shiftFairnessServiceGroups";

function card(overrides: Partial<ShiftFairnessCardView> = {}): ShiftFairnessCardView {
  return {
    key: "p1",
    personId: "p1",
    personName: "אדם בדיקה",
    avatarUrl: null,
    serviceCategory: "regular",
    href: "#",
    actualLabel: "4",
    targetLabel: "4",
    targetPeriodLabel: "צפי הוגן עד היום",
    deviationLabel: "0",
    status: "balanced",
    rangeStatus: "within",
    statusLabel: "בטווח הצפי",
    statusStateLabel: "בתוך הטווח ההוגן",
    statusExplanationLabel: "ביצעת משמרות בתוך טווח הצפי ההוגן שלך עד היום.",
    weekendActualLabel: "1",
    weekendTargetLabel: "1",
    weekendDeviationLabel: "0",
    weekendStatus: "balanced",
    weekendStatusStateLabel: "בהתאם לצפוי",
    unavailableNote: null,
    completenessNote: null,
    expectationFactorLabel: null,
    ...overrides,
  };
}

describe("groupShiftFairnessCardsByServiceType", () => {
  it("buckets cards into סדיר / קבע / מילואים, in that order, reading serviceCategory straight off each card", () => {
    const cards = [
      card({ key: "reg", personId: "p_regular", serviceCategory: "regular" }),
      card({ key: "perm", personId: "p_permanent", serviceCategory: "permanent" }),
      card({ key: "res", personId: "p_reserve", serviceCategory: "reserve" }),
    ];

    const groups = groupShiftFairnessCardsByServiceType(cards);

    expect(groups.map((g) => g.key)).toEqual(["regular", "permanent", "reserve"]);
    expect(groups.map((g) => g.label)).toEqual(["סדיר", "קבע", "מילואים"]);
    expect(groups[0].cards).toEqual([cards[0]]);
    expect(groups[1].cards).toEqual([cards[1]]);
    expect(groups[2].cards).toEqual([cards[2]]);
  });

  it("omits a subgroup entirely when it has no members -- never an empty heading", () => {
    const cards = [card({ personId: "p1", serviceCategory: "regular" })];

    const groups = groupShiftFairnessCardsByServiceType(cards);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("regular");
  });

  it("an empty card list produces zero subgroups", () => {
    expect(groupShiftFairnessCardsByServiceType([])).toEqual([]);
  });

  it("groups multiple people of the same service type together, preserving their relative order", () => {
    const cards = [
      card({ key: "a", personId: "p_a", serviceCategory: "regular" }),
      card({ key: "b", personId: "p_b", serviceCategory: "regular" }),
    ];

    const groups = groupShiftFairnessCardsByServiceType(cards);

    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((c) => c.key)).toEqual(["a", "b"]);
  });

  it("a card carrying serviceCategory: unclassified renders in its own last-ordered subgroup, never dropped", () => {
    const cards = [card({ personId: "p_unknown", serviceCategory: "unclassified" })];
    const groups = groupShiftFairnessCardsByServiceType(cards);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("unclassified");
    expect(groups[0].label).toBe("לא מסווג");
  });

  it("unclassified renders last when mixed with real categories", () => {
    const cards = [
      card({ key: "reg", personId: "p_regular", serviceCategory: "regular" }),
      card({ key: "unk", personId: "p_unknown", serviceCategory: "unclassified" }),
    ];

    const groups = groupShiftFairnessCardsByServiceType(cards);

    expect(groups.map((g) => g.key)).toEqual(["regular", "unclassified"]);
  });
});
