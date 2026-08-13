import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BottomNav } from "./BottomNav";
import { navItems } from "./nav-items";

const usePathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

afterEach(() => {
  cleanup();
  usePathname.mockReturnValue("/");
});

describe("BottomNav", () => {
  it("34. disabled items render no clickable link -- no dead routes", () => {
    render(<BottomNav />);
    const disabledItems = navItems.filter((item) => item.inBottomNav && !item.enabled);
    expect(disabledItems.length).toBeGreaterThan(0);
    for (const item of disabledItems) {
      expect(screen.queryByRole("link", { name: item.label })).toBeNull();
    }
  });

  it("only shows the curated bottom-nav subset, not every nav item", () => {
    render(<BottomNav />);
    const excluded = navItems.filter((item) => !item.inBottomNav);
    for (const item of excluded) {
      expect(screen.queryByText(item.shortLabel)).toBeNull();
    }
  });

  it("the enabled dashboard route is a real link and marked as the current page", () => {
    render(<BottomNav />);
    const current = screen.getByRole("link", { current: "page" });
    expect(current).toHaveAttribute("href", "/");
  });

  it("the schedule route is enabled: a real link, not aria-current on a different pathname", () => {
    render(<BottomNav />);
    const scheduleLink = screen.getByRole("link", { name: "משמרות" });
    expect(scheduleLink).toHaveAttribute("href", "/schedule");
    expect(scheduleLink).not.toHaveAttribute("aria-current");
  });

  it("the duties route is enabled: a real link, not aria-current on a different pathname", () => {
    render(<BottomNav />);
    const dutiesLink = screen.getByRole("link", { name: "תורנויות" });
    expect(dutiesLink).toHaveAttribute("href", "/duties");
    expect(dutiesLink).not.toHaveAttribute("aria-current");
  });

  it("other future routes (with-me) remain disabled", () => {
    render(<BottomNav />);
    expect(screen.queryByRole("link", { name: "מי איתי" })).toBeNull();
  });

  it("marks /duties as the current page when that's the active pathname", () => {
    usePathname.mockReturnValue("/duties");
    render(<BottomNav />);
    const dutiesLink = screen.getByRole("link", { current: "page" });
    expect(dutiesLink).toHaveAttribute("href", "/duties");
  });

  it("disabled entries are marked aria-disabled, genuinely non-interactive", () => {
    const { container } = render(<BottomNav />);
    const disabled = container.querySelectorAll('[aria-disabled="true"]');
    expect(disabled.length).toBeGreaterThan(0);
    disabled.forEach((el) => expect(el.tagName).not.toBe("A"));
  });
});
