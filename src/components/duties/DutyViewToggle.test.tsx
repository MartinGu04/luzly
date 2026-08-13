import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DutyViewToggle } from "./DutyViewToggle";

afterEach(() => {
  cleanup();
});

describe("DutyViewToggle", () => {
  it("links to the correct hrefs", () => {
    render(<DutyViewToggle view="upcoming" />);
    expect(screen.getByRole("link", { name: "קרובות" })).toHaveAttribute("href", "/duties");
    expect(screen.getByRole("link", { name: "היסטוריה" })).toHaveAttribute("href", "/duties?view=history");
  });

  it("marks 'קרובות' as current when view is upcoming", () => {
    render(<DutyViewToggle view="upcoming" />);
    expect(screen.getByRole("link", { name: "קרובות" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "היסטוריה" })).not.toHaveAttribute("aria-current");
  });

  it("marks 'היסטוריה' as current when view is history", () => {
    render(<DutyViewToggle view="history" />);
    expect(screen.getByRole("link", { name: "היסטוריה" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "קרובות" })).not.toHaveAttribute("aria-current");
  });
});
