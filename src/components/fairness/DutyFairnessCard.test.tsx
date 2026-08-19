import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DutyFairnessCardView } from "@/lib/presentation/fairnessCards";
import { DutyFairnessCard } from "./DutyFairnessCard";

afterEach(() => {
  cleanup();
});

function view(overrides: Partial<DutyFairnessCardView> = {}): DutyFairnessCardView {
  return {
    key: "p_1-0",
    personId: "p_1",
    personName: "נועה טכנאית",
    avatarUrl: null,
    href: "/fairness?mode=duties&person=p_1",
    allocationLabel: "טכנאי",
    currentLabel: "6",
    targetLabel: "8",
    deltaLabel: "+1.00",
    gapLabel: "-2.00",
    status: "below",
    weekendLabel: "2",
    exemptionBadges: [],
    ...overrides,
  };
}

describe("DutyFairnessCard — avatar", () => {
  it("shows initials when the row has no avatarUrl", () => {
    render(
      <ul>
        <DutyFairnessCard view={view({ avatarUrl: null, personName: "נועה טכנאית" })} />
      </ul>,
    );
    expect(screen.queryByTestId("avatar-photo")).toBeNull();
    expect(screen.getByText("נט")).toBeInTheDocument();
  });

  it("shows the Google photo when the row has an avatarUrl", () => {
    render(
      <ul>
        <DutyFairnessCard view={view({ avatarUrl: "https://lh3.googleusercontent.com/a/noa.jpg" })} />
      </ul>,
    );
    const img = screen.getByTestId("avatar-photo");
    expect(img).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/noa.jpg");
  });

  it("each row renders its OWN person's avatar -- no cross-leak between rows", () => {
    render(
      <ul>
        <DutyFairnessCard
          view={view({ key: "a", personId: "p_a", personName: "דני", avatarUrl: "https://lh3.googleusercontent.com/a/dani.jpg" })}
        />
        <DutyFairnessCard view={view({ key: "b", personId: "p_b", personName: "נועה", avatarUrl: null })} />
      </ul>,
    );

    const photos = screen.getAllByTestId("avatar-photo");
    expect(photos).toHaveLength(1);
    expect(photos[0]).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/dani.jpg");
    expect(screen.getByText("נו")).toBeInTheDocument(); // "נועה" initials, single-word name
  });

  it("still renders the rest of the card (metrics, name, allocation) unchanged alongside the avatar", () => {
    render(
      <ul>
        <DutyFairnessCard view={view({ avatarUrl: "https://lh3.googleusercontent.com/a/noa.jpg" })} />
      </ul>,
    );
    expect(screen.getByText("נועה טכנאית")).toBeInTheDocument();
    expect(screen.getByText("טכנאי")).toBeInTheDocument();
    expect(screen.getByTestId("metric-duty-current")).toBeInTheDocument();
  });
});
