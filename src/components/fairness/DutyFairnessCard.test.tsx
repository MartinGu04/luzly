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
    completedAllocationLabel: "2.9",
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

describe("DutyFairnessCard — primary metric grid order and content", () => {
  it("renders the four primary metrics in the required order: הקצאות שבוצעו, ניקוד נוכחי, יעד השוואה, פער מהיעד", () => {
    render(
      <ul>
        <DutyFairnessCard view={view({ completedAllocationLabel: "2.9", currentLabel: "6", targetLabel: "8", gapLabel: "-2.00" })} />
      </ul>,
    );
    const grid = screen.getByTestId("metric-duty-allocation").parentElement;
    const gridChildIds = Array.from(grid?.children ?? []).map((child) => child.getAttribute("data-testid"));
    expect(gridChildIds).toEqual(["metric-duty-allocation", "metric-duty-current", "metric-duty-target", "metric-duty-gap"]);
  });

  it("shows the weighted completed-allocation total as a plain value, distinct from the workbook current score", () => {
    render(
      <ul>
        <DutyFairnessCard view={view({ completedAllocationLabel: "2.9", currentLabel: "6" })} />
      </ul>,
    );
    expect(screen.getByTestId("metric-duty-allocation")).toHaveTextContent("הקצאות שבוצעו");
    expect(screen.getByTestId("metric-duty-allocation")).toHaveTextContent("2.9");
    expect(screen.getByTestId("metric-duty-current")).toHaveTextContent("6");
  });

  it("still renders a completed-allocation total for a non-comparable person (null target/status/gap)", () => {
    render(
      <ul>
        <DutyFairnessCard
          view={view({ completedAllocationLabel: "0.5", targetLabel: null, gapLabel: null, status: null })}
        />
      </ul>,
    );
    expect(screen.getByTestId("metric-duty-allocation")).toHaveTextContent("0.5");
    expect(screen.getByTestId("metric-duty-target")).toHaveTextContent("—");
  });

  it("renders \"—\" for an unresolved identity's (or unsupported block shape's) completed-allocation total, never a fabricated 0", () => {
    render(
      <ul>
        <DutyFairnessCard view={view({ completedAllocationLabel: "—" })} />
      </ul>,
    );
    expect(screen.getByTestId("metric-duty-allocation")).toHaveTextContent("—");
  });
});

describe("DutyFairnessCard — density and responsive row/2x2 layout", () => {
  it("the card root establishes a CSS container-query context (@container), so the primary grid responds to the CARD's own width, never the viewport", () => {
    render(
      <ul>
        <DutyFairnessCard view={view()} />
      </ul>,
    );
    expect(screen.getByRole("link")).toHaveClass("@container");
  });

  it("the primary metric grid is a compact 2-column fallback that expands to one 4-column row once the card itself is wide enough", () => {
    render(
      <ul>
        <DutyFairnessCard view={view()} />
      </ul>,
    );
    const grid = screen.getByTestId("metric-duty-allocation").parentElement;
    expect(grid).toHaveClass("grid-cols-2");
    expect(grid).toHaveClass("@[380px]:grid-cols-4");
  });

  it("never lays the primary grid out as 3 columns", () => {
    render(
      <ul>
        <DutyFairnessCard view={view()} />
      </ul>,
    );
    const grid = screen.getByTestId("metric-duty-allocation").parentElement;
    expect(grid?.className).not.toMatch(/grid-cols-3/);
  });
});
