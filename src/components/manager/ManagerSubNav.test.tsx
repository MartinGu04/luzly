import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerSubNav } from "./ManagerSubNav";

afterEach(() => {
  cleanup();
});

describe("ManagerSubNav", () => {
  it("renders real links to /manager (סקירה) and /manager/fairness (טבלת צדק)", () => {
    render(<ManagerSubNav active="overview" />);
    expect(screen.getByRole("link", { name: "סקירה" })).toHaveAttribute("href", "/manager");
    expect(screen.getByRole("link", { name: "טבלת צדק" })).toHaveAttribute("href", "/manager/fairness");
  });

  it("marks the active tab with aria-current, and only the active tab", () => {
    render(<ManagerSubNav active="fairness" />);
    expect(screen.getByRole("link", { name: "טבלת צדק" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "סקירה" })).not.toHaveAttribute("aria-current");
  });

  it("never renders a מנהל badge -- ManagerHeader already establishes that scope", () => {
    render(<ManagerSubNav active="overview" />);
    expect(screen.queryByText("מנהל")).toBeNull();
  });

  it("never stretches to the full width of a flex flex-col parent -- sized to its own content (Design Pass PR #21 follow-up hardening)", () => {
    render(<ManagerSubNav active="overview" />);
    const nav = screen.getByRole("navigation", { name: "ניווט אזור מנהל" });
    expect(nav).toHaveClass("w-fit");
    expect(nav).toHaveClass("self-start");
  });
});
