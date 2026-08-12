import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MonthNav } from "./MonthNav";

afterEach(() => {
  cleanup();
});

describe("MonthNav", () => {
  it("links to the correct prev/next/today hrefs", () => {
    render(
      <MonthNav
        prevHref="/schedule?month=2026-07"
        nextHref="/schedule?month=2026-09"
        todayHref="/schedule"
        isOnCurrentMonth={false}
      />,
    );
    expect(screen.getByRole("link", { name: "חודש קודם" })).toHaveAttribute("href", "/schedule?month=2026-07");
    expect(screen.getByRole("link", { name: "חודש הבא" })).toHaveAttribute("href", "/schedule?month=2026-09");
    expect(screen.getByRole("link", { name: "היום" })).toHaveAttribute("href", "/schedule");
  });

  it("the today link is a normal server-rendered link, not a query-param-driven client date", () => {
    render(
      <MonthNav prevHref="/schedule?month=2026-07" nextHref="/schedule?month=2026-09" todayHref="/schedule" isOnCurrentMonth />,
    );
    const todayLink = screen.getByRole("link", { name: "היום" });
    expect(todayLink.getAttribute("href")).not.toContain("?month=");
  });

  it("marks today as the current view when already on the current month", () => {
    render(
      <MonthNav prevHref="/schedule?month=2026-07" nextHref="/schedule?month=2026-09" todayHref="/schedule" isOnCurrentMonth />,
    );
    expect(screen.getByRole("link", { name: "היום" })).toHaveAttribute("aria-current", "date");
  });

  it("does not mark today as current when viewing a different month", () => {
    render(
      <MonthNav
        prevHref="/schedule?month=2026-07"
        nextHref="/schedule?month=2026-09"
        todayHref="/schedule"
        isOnCurrentMonth={false}
      />,
    );
    expect(screen.getByRole("link", { name: "היום" })).not.toHaveAttribute("aria-current");
  });
});
