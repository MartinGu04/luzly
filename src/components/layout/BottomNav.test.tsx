import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BottomNav } from "./BottomNav";
import { navItems } from "./nav-items";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(() => {
  cleanup();
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
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("disabled entries are marked aria-disabled, genuinely non-interactive", () => {
    const { container } = render(<BottomNav />);
    const disabled = container.querySelectorAll('[aria-disabled="true"]');
    expect(disabled.length).toBeGreaterThan(0);
    disabled.forEach((el) => expect(el.tagName).not.toBe("A"));
  });
});
