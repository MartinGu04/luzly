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
});
