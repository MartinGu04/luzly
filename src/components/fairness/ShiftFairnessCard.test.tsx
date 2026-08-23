import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ShiftFairnessCardView } from "@/lib/presentation/fairnessCards";
import { ShiftFairnessCard } from "./ShiftFairnessCard";

afterEach(() => {
  cleanup();
});

function view(overrides: Partial<ShiftFairnessCardView> = {}): ShiftFairnessCardView {
  return {
    key: "p_1",
    personId: "p_1",
    personName: "דני טכנאי",
    avatarUrl: null,
    serviceCategory: "regular",
    href: "/fairness?person=p_1",
    actualLabel: "4",
    targetLabel: "4–5",
    targetPeriodLabel: "צפי הוגן עד היום",
    deviationLabel: "-0.3",
    status: "balanced",
    rangeStatus: "within",
    statusLabel: "בטווח הצפי",
    statusStateLabel: "בתוך הטווח ההוגן",
    statusExplanationLabel: "ביצעת משמרות בתוך טווח הצפי ההוגן שלך עד היום.",
    weekendActualLabel: "1",
    weekendTargetLabel: "1.2",
    weekendDeviationLabel: "-0.2",
    weekendStatus: "balanced",
    weekendStatusStateLabel: "בהתאם לצפוי",
    unavailableNote: null,
    completenessNote: null,
    expectationFactorLabel: null,
    ...overrides,
  };
}

describe("ShiftFairnessCard — avatar", () => {
  it("shows initials when the row has no avatarUrl", () => {
    render(
      <ul>
        <ShiftFairnessCard view={view({ avatarUrl: null, personName: "דני טכנאי" })} />
      </ul>,
    );
    expect(screen.queryByTestId("avatar-photo")).toBeNull();
    expect(screen.getByText("דט")).toBeInTheDocument();
  });

  it("shows the Google photo when the row has an avatarUrl", () => {
    render(
      <ul>
        <ShiftFairnessCard view={view({ avatarUrl: "https://lh3.googleusercontent.com/a/dani.jpg" })} />
      </ul>,
    );
    const img = screen.getByTestId("avatar-photo");
    expect(img).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/dani.jpg");
  });

  it("each row renders its OWN person's avatar -- no cross-leak between rows", () => {
    render(
      <ul>
        <ShiftFairnessCard
          view={view({ key: "a", personId: "p_a", personName: "דני", avatarUrl: "https://lh3.googleusercontent.com/a/dani.jpg" })}
        />
        <ShiftFairnessCard view={view({ key: "b", personId: "p_b", personName: "נועה", avatarUrl: null })} />
      </ul>,
    );

    const photos = screen.getAllByTestId("avatar-photo");
    expect(photos).toHaveLength(1);
    expect(photos[0]).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/dani.jpg");
    expect(screen.getByText("נו")).toBeInTheDocument();
  });

  it("still renders the rest of the card (name, metrics, info control) unchanged alongside the avatar", () => {
    render(
      <ul>
        <ShiftFairnessCard view={view({ avatarUrl: "https://lh3.googleusercontent.com/a/dani.jpg" })} />
      </ul>,
    );
    expect(screen.getByText("דני טכנאי")).toBeInTheDocument();
    expect(screen.getByTestId("metric-shift-actual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הסבר על מדדי הכרטיס" })).toBeInTheDocument();
  });

  it("falls back to initials when the photo fails to load", () => {
    render(
      <ul>
        <ShiftFairnessCard view={view({ avatarUrl: "https://lh3.googleusercontent.com/a/broken.jpg" })} />
      </ul>,
    );
    const img = screen.getByTestId("avatar-photo");
    fireEvent.error(img);
    expect(screen.queryByTestId("avatar-photo")).toBeNull();
    expect(screen.getByText("דט")).toBeInTheDocument();
  });
});

describe("ShiftFairnessCard — status badge/explanation clarity", () => {
  it("the badge shows 'above EXPECTED', never 'above target', for an above-expectation person", () => {
    render(
      <ul>
        <ShiftFairnessCard
          view={view({
            status: "above",
            rangeStatus: "above",
            statusLabel: "מעל הצפי",
            statusStateLabel: "מעל הטווח ההוגן",
            statusExplanationLabel: "ביצעת יותר משמרות מטווח הצפי ההוגן שלך עד היום.",
          })}
        />
      </ul>,
    );
    // The badge (short word) and the "מצב" row (descriptive wording) each
    // appear exactly ONCE now -- no duplicated text on the card.
    expect(screen.getByText("מעל הצפי")).toBeInTheDocument();
    expect(screen.getByText("מעל הטווח ההוגן")).toBeInTheDocument();
    expect(screen.queryByText("מעל היעד")).toBeNull();
  });

  it("renders the human-readable explanation sentence under the status row", () => {
    render(
      <ul>
        <ShiftFairnessCard
          view={view({
            status: "above",
            rangeStatus: "above",
            statusExplanationLabel: "ביצעת יותר משמרות מטווח הצפי ההוגן שלך עד היום.",
          })}
        />
      </ul>,
    );
    expect(screen.getByTestId("metric-shift-status-explanation")).toHaveTextContent(
      "ביצעת יותר משמרות מטווח הצפי ההוגן שלך עד היום.",
    );
  });

  it("omits the explanation row entirely when statusExplanationLabel is null", () => {
    render(
      <ul>
        <ShiftFairnessCard view={view({ statusExplanationLabel: null })} />
      </ul>,
    );
    expect(screen.queryByTestId("metric-shift-status-explanation")).toBeNull();
  });
});
