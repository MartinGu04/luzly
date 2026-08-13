import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerRangeSelector } from "./ManagerRangeSelector";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";

afterEach(() => {
  cleanup();
});

const BASE: ManagerHrefParams = { personId: null, range: "7d", month: null, problemsOnly: false };

describe("ManagerRangeSelector", () => {
  it("renders all four range options", () => {
    render(<ManagerRangeSelector current={BASE} currentMonth={null} />);
    expect(screen.getByRole("link", { name: "היום" })).toHaveAttribute("href", "/manager?range=today");
    expect(screen.getByRole("link", { name: "7 ימים" })).toHaveAttribute("href", "/manager");
    expect(screen.getByRole("link", { name: "30 יום" })).toHaveAttribute("href", "/manager?range=30d");
    expect(screen.getByRole("link", { name: "חודש" })).toHaveAttribute("href", "/manager?range=month");
  });

  it("marks the active range with aria-current", () => {
    render(<ManagerRangeSelector current={{ ...BASE, range: "today" }} currentMonth={null} />);
    expect(screen.getByRole("link", { name: "היום" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "7 ימים" })).not.toHaveAttribute("aria-current");
  });

  it("preserves the selected person when switching range", () => {
    render(<ManagerRangeSelector current={{ ...BASE, personId: "p_1" }} currentMonth={null} />);
    expect(screen.getByRole("link", { name: "30 יום" })).toHaveAttribute("href", "/manager?person=p_1&range=30d");
  });

  it("shows prev/next month controls only when range is month", () => {
    render(<ManagerRangeSelector current={BASE} currentMonth={null} />);
    expect(screen.queryByLabelText("חודש קודם")).toBeNull();

    render(<ManagerRangeSelector current={{ ...BASE, range: "month" }} currentMonth={{ year: 2026, month: 8 }} />);
    expect(screen.getByLabelText("חודש קודם")).toHaveAttribute("href", "/manager?range=month&month=2026-07");
    expect(screen.getByLabelText("חודש הבא")).toHaveAttribute("href", "/manager?range=month&month=2026-09");
  });

  it("rolls the year over at a December/January boundary", () => {
    render(<ManagerRangeSelector current={{ ...BASE, range: "month" }} currentMonth={{ year: 2026, month: 12 }} />);
    expect(screen.getByLabelText("חודש הבא")).toHaveAttribute("href", "/manager?range=month&month=2027-01");
  });
});
