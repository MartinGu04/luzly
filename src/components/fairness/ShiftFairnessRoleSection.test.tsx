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
