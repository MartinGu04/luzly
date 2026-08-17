import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FairnessModeToggle } from "./FairnessModeToggle";

afterEach(() => {
  cleanup();
});

describe("FairnessModeToggle", () => {
  it("Shift is the default, bare-URL destination -- never carries mode=", () => {
    render(<FairnessModeToggle active="shifts" />);
    expect(screen.getByRole("tab", { name: "משמרות" })).toHaveAttribute("href", "/fairness");
  });

  it("Duty always carries mode=duties explicitly", () => {
    render(<FairnessModeToggle active="shifts" />);
    expect(screen.getByRole("tab", { name: "תורנויות" })).toHaveAttribute("href", "/fairness?mode=duties");
  });

  it("exposes the selected state accessibly via aria-selected, not color alone", () => {
    render(<FairnessModeToggle active="duties" />);
    expect(screen.getByRole("tab", { name: "משמרות" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "תורנויות" })).toHaveAttribute("aria-selected", "true");
  });

  it("is exposed as a real tablist for assistive tech", () => {
    render(<FairnessModeToggle active="shifts" />);
    expect(screen.getByRole("tablist", { name: "מצב תצוגה" })).toBeInTheDocument();
  });

  it("never renders a combined/משולב option", () => {
    render(<FairnessModeToggle active="shifts" />);
    expect(screen.queryByText("משולב")).toBeNull();
  });
});
