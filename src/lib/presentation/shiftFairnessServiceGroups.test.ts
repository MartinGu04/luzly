import { describe, expect, it } from "vitest";
import type { ShiftFairnessCardView } from "./fairnessCards";
import { groupShiftFairnessCardsByServiceType } from "./shiftFairnessServiceGroups";

function card(overrides: Partial<ShiftFairnessCardView> = {}): ShiftFairnessCardView {
  return {
    key: "p1",
    personId: "p1",
    personName: "אדם בדיקה",
    href: "#",
    actualLabel: "4",
    targetLabel: "4",
    deviationLabel: "0",
    status: "balanced",
    weekendActualLabel: "1",
    weekendTargetLabel: "1",
    weekendDeviationLabel: "0",
    weekendStatus: "balanced",
    unavailableNote: null,
    completenessNote: null,
    ...overrides,
  };
}

describe("groupShiftFairnessCardsByServiceType", () => {
  it("buckets cards into סדיר / קבע / מילואים, in that order", () => {
    const cards = [
      card({ key: "reg", personId: "p_regular" }),
      card({ key: "perm", personId: "p_permanent" }),
      card({ key: "res", personId: "p_reserve" }),
    ];
    const byId = new Map([
      ["p_regular", "regular" as const],
      ["p_permanent", "permanent" as const],
      ["p_reserve", "reserve" as const],
    ]);

    const groups = groupShiftFairnessCardsByServiceType(cards, byId);

    expect(groups.map((g) => g.key)).toEqual(["regular", "permanent", "reserve"]);
    expect(groups.map((g) => g.label)).toEqual(["סדיר", "קבע", "מילואים"]);
    expect(groups[0].cards).toEqual([cards[0]]);
    expect(groups[1].cards).toEqual([cards[1]]);
    expect(groups[2].cards).toEqual([cards[2]]);
  });

  it("omits a subgroup entirely when it has no members -- never an empty heading", () => {
    const cards = [card({ personId: "p1" })];
    const byId = new Map([["p1", "regular" as const]]);

    const groups = groupShiftFairnessCardsByServiceType(cards, byId);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("regular");
  });

  it("an empty card list produces zero subgroups", () => {
    expect(groupShiftFairnessCardsByServiceType([], new Map())).toEqual([]);
  });

  it("groups multiple people of the same service type together, preserving their relative order", () => {
    const cards = [
      card({ key: "a", personId: "p_a" }),
      card({ key: "b", personId: "p_b" }),
    ];
    const byId = new Map([
      ["p_a", "regular" as const],
      ["p_b", "regular" as const],
    ]);

    const groups = groupShiftFairnessCardsByServiceType(cards, byId);

    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((c) => c.key)).toEqual(["a", "b"]);
  });

  it("a person id absent from the map safely falls to unclassified, never dropped", () => {
    const cards = [card({ personId: "p_unknown" })];
    const groups = groupShiftFairnessCardsByServiceType(cards, new Map());

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("unclassified");
    expect(groups[0].label).toBe("לא מסווג");
  });

  it("unclassified renders last when mixed with real categories", () => {
    const cards = [
      card({ key: "reg", personId: "p_regular" }),
      card({ key: "unk", personId: "p_unknown" }),
    ];
    const byId = new Map([["p_regular", "regular" as const]]);

    const groups = groupShiftFairnessCardsByServiceType(cards, byId);

    expect(groups.map((g) => g.key)).toEqual(["regular", "unclassified"]);
  });
});
