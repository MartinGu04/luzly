import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("renders exactly N slice arcs for N slices (<= 7)", () => {
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

describe("ManagerFairnessChart — pointer hover on slices, keyboard on legend (Design Pass PR #21 follow-up hardening)", () => {
  const slices = [
    { id: "p_a", name: "מרטין בדיקה", score: 6, percentage: 60 },
    { id: "p_b", name: "איתן דוגמה", score: 4, percentage: 40 },
  ];

  function segmentFor(container: HTMLElement, index: number) {
    // index 0 is the background ring, slice segments start at index 1.
    return container.querySelectorAll("g circle")[index + 1] as SVGCircleElement;
  }

  function legendButtonFor(index: number) {
    return screen.getAllByRole("button")[index];
  }

  it("SVG segments never carry fake button semantics -- no role, no tabIndex, no aria-label", () => {
    const { container } = render(<ManagerFairnessChart slices={slices} />);
    const segment = segmentFor(container, 0);
    expect(segment).not.toHaveAttribute("role");
    expect(segment).not.toHaveAttribute("tabindex");
    expect(segment).not.toHaveAttribute("aria-label");
    expect(segment).toHaveAttribute("aria-hidden", "true");
  });

  it("legend rows are real <button> elements -- natively focusable, no ARIA role-faking", () => {
    render(<ManagerFairnessChart slices={slices} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(slices.length);
    expect(buttons[0].tagName).toBe("BUTTON");
  });

  it("each legend button carries an aria-label with name/score/percentage -- keyboard focus alone exposes equivalent info", () => {
    render(<ManagerFairnessChart slices={slices} />);
    expect(legendButtonFor(0)).toHaveAttribute("aria-label", "מרטין בדיקה · 6 · 60%");
  });

  it("hovering a slice segment (pointer) shows its name/score/percentage in the visual readout", () => {
    const { container } = render(<ManagerFairnessChart slices={slices} />);
    fireEvent.mouseEnter(segmentFor(container, 0));
    expect(screen.getByText("מרטין בדיקה · 6 · 60%")).toBeInTheDocument();
  });

  it("mouse leaving the segment clears the readout -- never trapped open", () => {
    const { container } = render(<ManagerFairnessChart slices={slices} />);
    const segment = segmentFor(container, 0);
    fireEvent.mouseEnter(segment);
    expect(screen.getByText("מרטין בדיקה · 6 · 60%")).toBeInTheDocument();
    fireEvent.mouseLeave(segment);
    expect(screen.queryByText("מרטין בדיקה · 6 · 60%")).toBeNull();
  });

  it("focusing a legend button (keyboard) shows the same readout as hovering its slice", () => {
    render(<ManagerFairnessChart slices={slices} />);
    fireEvent.focus(legendButtonFor(1));
    expect(screen.getByText("איתן דוגמה · 4 · 40%")).toBeInTheDocument();
  });

  it("blurring the legend button (focus leaving) clears the readout -- never trapped open", () => {
    render(<ManagerFairnessChart slices={slices} />);
    const button = legendButtonFor(1);
    fireEvent.focus(button);
    expect(screen.getByText("איתן דוגמה · 4 · 40%")).toBeInTheDocument();
    fireEvent.blur(button);
    expect(screen.queryByText("איתן דוגמה · 4 · 40%")).toBeNull();
  });

  it("Escape closes the readout while a legend button is focused", () => {
    render(<ManagerFairnessChart slices={slices} />);
    const button = legendButtonFor(0);
    fireEvent.focus(button);
    expect(screen.getByText("מרטין בדיקה · 6 · 60%")).toBeInTheDocument();
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByText("מרטין בדיקה · 6 · 60%")).toBeNull();
  });

  it("the legend stays visible regardless of hover/focus state -- never the only way to read the chart", () => {
    const { container } = render(<ManagerFairnessChart slices={slices} />);
    fireEvent.mouseEnter(segmentFor(container, 0));
    expect(screen.getByLabelText("מקרא התרשים")).toBeInTheDocument();
    expect(screen.getByText("מרטין בדיקה")).toBeInTheDocument();
    expect(screen.getByText("איתן דוגמה")).toBeInTheDocument();
  });
});

function namedSlices(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p_${i}`,
    name: `אדם ${i}`,
    score: 1,
    percentage: 100 / count,
  }));
}

describe("ManagerFairnessChart — exactly-N-slice color assignment (hardening pass)", () => {
  it("7 slices: all 7 named, no 'אחרים' aggregate", () => {
    const { container } = render(<ManagerFairnessChart slices={namedSlices(7)} />);
    const legend = screen.getByLabelText("מקרא התרשים");
    expect(legend.textContent).not.toContain("אחרים");
    // Every legend row is a real named slice -- 1 background ring + 7 named slice circles.
    expect(container.querySelectorAll("g circle")).toHaveLength(8);
    // Every referenced series variable is one of the 7 defined ones (never series-8+).
    const strokes = [...container.querySelectorAll("g circle")].map((el) => el.getAttribute("stroke"));
    for (const stroke of strokes) {
      expect(stroke).not.toMatch(/--fairness-series-(8|9|\d\d)\)/);
    }
  });

  it("8 slices: never references the undefined --fairness-series-8 -- folds to 7 named + 'אחרים (1)'", () => {
    const { container } = render(<ManagerFairnessChart slices={namedSlices(8)} />);
    const legend = screen.getByLabelText("מקרא התרשים");
    expect(legend.textContent).toContain("אחרים (1)");

    const strokes = [...container.querySelectorAll("g circle")].map((el) => el.getAttribute("stroke"));
    expect(strokes).not.toContain("var(--fairness-series-8)");
    for (const stroke of strokes) {
      expect(stroke).not.toMatch(/--fairness-series-(8|9|\d\d)\)/);
    }

    // 1 background ring + 7 named slice circles + 1 aggregate "other" circle.
    expect(container.querySelectorAll("g circle")).toHaveLength(9);
  });

  it("the light-mode inline style block only ever defines 7 series variables, for any slice count", () => {
    const { container: eight } = render(<ManagerFairnessChart slices={namedSlices(8)} />);
    const figureEight = eight.querySelector(".luzly-fairness-chart") as HTMLElement;
    expect(figureEight.style.getPropertyValue("--fairness-series-8")).toBe("");

    const { container: twenty } = render(<ManagerFairnessChart slices={namedSlices(20)} />);
    const figureTwenty = twenty.querySelector(".luzly-fairness-chart") as HTMLElement;
    expect(figureTwenty.style.getPropertyValue("--fairness-series-8")).toBe("");
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
