import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerFairnessChart } from "./ManagerFairnessChart";

afterEach(() => {
  cleanup();
});

describe("ManagerFairnessChart — empty state", () => {
  it("shows a calm empty state, no division by zero, no crash", () => {
    render(<ManagerFairnessChart slices={[]} />);
    expect(screen.getByText("אין עדיין נתוני ניקוד נוכחי להצגה בתרשים.")).toBeInTheDocument();
  });
});

describe("ManagerFairnessChart — populated", () => {
  const slices = [
    { id: "p_a", name: "מרטין בדיקה", score: 6, percentage: 60 },
    { id: "p_b", name: "איתן דוגמה", score: 4, percentage: 40 },
  ];

  it("renders one legend row per slice", () => {
    render(<ManagerFairnessChart slices={slices} />);
    expect(screen.getByText("מרטין בדיקה")).toBeInTheDocument();
    expect(screen.getByText("איתן דוגמה")).toBeInTheDocument();
  });

  it("percentages sum to ~100 across the legend", () => {
    render(<ManagerFairnessChart slices={slices} />);
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("has an accessible chart label", () => {
    render(<ManagerFairnessChart slices={slices} />);
    expect(screen.getByRole("img", { name: "חלוקת הניקוד הנוכחי בצוות" })).toBeInTheDocument();
  });

  it("a legend list is always visible (not hover-only)", () => {
    render(<ManagerFairnessChart slices={slices} />);
    expect(screen.getByLabelText("מקרא התרשים")).toBeInTheDocument();
  });

  it("renders exactly N slice arcs for N slices (<= 8)", () => {
    const { container } = render(<ManagerFairnessChart slices={slices} />);
    // 1 background ring + N slice circles inside the rotated group.
    const circles = container.querySelectorAll("g circle");
    expect(circles).toHaveLength(1 + slices.length);
  });

  it("a person with an exemption is still included -- the chart only receives safe slice data, no exemption field at all", () => {
    render(<ManagerFairnessChart slices={[{ id: "p_exempt", name: "עם פטור", score: 3, percentage: 100 }]} />);
    expect(screen.getByText("עם פטור")).toBeInTheDocument();
  });

  it("never receives more than {id, name, score, percentage} -- no email/sourceSheet/sourceCell can leak", () => {
    render(<ManagerFairnessChart slices={slices} />);
    const legendText = screen.getByLabelText("מקרא התרשים").textContent ?? "";
    expect(legendText).not.toContain("sourceSheet");
    expect(legendText).not.toContain("@");
  });
});

describe("ManagerFairnessChart — folds beyond 7 named slices into 'אחרים'", () => {
  it("caps at 7 named slices plus one aggregate 'other' slice", () => {
    const manySlices = Array.from({ length: 10 }, (_, i) => ({
      id: `p_${i}`,
      name: `אדם ${i}`,
      score: 1,
      percentage: 10,
    }));
    render(<ManagerFairnessChart slices={manySlices} />);
    const legend = screen.getByLabelText("מקרא התרשים");
    expect(legend.textContent).toContain("אחרים (3)");
  });
});
