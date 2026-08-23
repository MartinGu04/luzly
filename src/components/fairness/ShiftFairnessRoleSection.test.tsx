import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ShiftFairnessCardView } from "@/lib/presentation/fairnessCards";
import type { ShiftFairnessServiceSubgroupView } from "@/lib/presentation/shiftFairnessServiceGroups";
import { ShiftFairnessRoleSection } from "./ShiftFairnessRoleSection";

afterEach(() => {
  cleanup();
});

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
    statusStateLabel: "בטווח הצפי",
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

describe("ShiftFairnessRoleSection", () => {
  it("renders the role heading with its own count, then each subgroup heading with its own count", () => {
    const subgroups: ShiftFairnessServiceSubgroupView[] = [
      { key: "regular", label: "סדיר", cards: [card({ key: "a", personId: "a", personName: "אדם א" })] },
      {
        key: "permanent",
        label: "קבע",
        cards: [
          card({ key: "b", personId: "b", personName: "אדם ב" }),
          card({ key: "c", personId: "c", personName: "אדם ג" }),
        ],
      },
    ];

    render(<ShiftFairnessRoleSection label="טכנאים" count={3} subgroups={subgroups} />);

    expect(screen.getByRole("heading", { level: 2, name: /טכנאים/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /טכנאים/ }).textContent).toContain("3");

    expect(screen.getByRole("heading", { level: 3, name: /סדיר/ }).textContent).toContain("1");
    expect(screen.getByRole("heading", { level: 3, name: /קבע/ }).textContent).toContain("2");

    expect(screen.getByText("אדם א")).toBeInTheDocument();
    expect(screen.getByText("אדם ב")).toBeInTheDocument();
    expect(screen.getByText("אדם ג")).toBeInTheDocument();
  });

  it("never renders a subgroup heading for a service type with no members -- the caller already omits it", () => {
    const subgroups: ShiftFairnessServiceSubgroupView[] = [
      { key: "regular", label: "סדיר", cards: [card()] },
    ];

    render(<ShiftFairnessRoleSection label="אחמ״שים" count={1} subgroups={subgroups} />);

    expect(screen.queryByText("קבע")).toBeNull();
    expect(screen.queryByText("מילואים")).toBeNull();
  });
});
