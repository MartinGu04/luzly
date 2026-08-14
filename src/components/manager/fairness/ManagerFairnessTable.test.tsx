import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerFairnessTable } from "./ManagerFairnessTable";
import type { ManagerFairnessRowCardView } from "./types";

afterEach(() => {
  cleanup();
});

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

describe("ManagerFairnessTable", () => {
  it("shows an empty message when there are no rows", () => {
    render(<ManagerFairnessTable rows={[]} />);
    expect(screen.getByText("לא נמצאה טבלת צדק לתקופה שנבחרה.")).toBeInTheDocument();
  });

  it("groups rows by role: אחמ״שים, טכנאים, אחרים", () => {
    render(
      <ManagerFairnessTable
        rows={[
          row({ key: "s1", sourceName: "אחמש אחד", allocationLabel: 'אחמ"ש' }),
          row({ key: "t1", sourceName: "טכנאי אחד", allocationLabel: "טכנאי" }),
          row({ key: "o1", sourceName: "אחר אחד", allocationLabel: "הסמכה" }),
        ]}
      />,
    );
    expect(screen.getByText(/אחמ״שים/)).toBeInTheDocument();
    expect(screen.getByText(/טכנאים/)).toBeInTheDocument();
    expect(screen.getByText(/אחרים/)).toBeInTheDocument();
    expect(screen.getByText("אחמש אחד")).toBeInTheDocument();
    expect(screen.getByText("טכנאי אחד")).toBeInTheDocument();
    expect(screen.getByText("אחר אחד")).toBeInTheDocument();
  });

  it("never renders an empty group", () => {
    render(<ManagerFairnessTable rows={[row({ allocationLabel: "טכנאי" })]} />);
    expect(screen.queryByText(/אחמ״שים/)).toBeNull();
    expect(screen.queryByText(/^אחרים/)).toBeNull();
  });

  it("preserves the existing row order within a group -- never re-sorts, never labels a row 'מומלץ'/'הבא'/'עדיפות'", () => {
    const { container } = render(
      <ManagerFairnessTable
        rows={[
          row({ key: "z", sourceName: "ז אחרון", allocationLabel: "טכנאי" }),
          row({ key: "a", sourceName: "א ראשון", allocationLabel: "טכנאי" }),
        ]}
      />,
    );
    const names = [...container.querySelectorAll("li p.truncate.font-semibold")].map((el) => el.textContent);
    expect(names).toEqual(["ז אחרון", "א ראשון"]);
    expect(container.textContent).not.toContain("מומלץ");
    expect(container.textContent).not.toContain("הבא בתור");
    expect(container.textContent).not.toContain("עדיפות");
  });
});
