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
  it("34. any disabled bottom-nav item renders no clickable link -- no dead routes", () => {
    render(<BottomNav />);
    // The curated bottom-nav set (/, /schedule, /duties, /with-me,
    // /conflicts) is fully enabled today, so this may currently iterate
    // zero items -- it's a forward-looking safety net for whenever a
    // future item is disabled.
    const disabledItems = navItems.filter((item) => item.inBottomNav && !item.enabled);
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

  it("the with-me route is enabled: a real link, not aria-current on a different pathname", () => {
    render(<BottomNav />);
    const withMeLink = screen.getByRole("link", { name: "מי איתי" });
    expect(withMeLink).toHaveAttribute("href", "/with-me");
    expect(withMeLink).not.toHaveAttribute("aria-current");
  });

  it("the conflicts route is enabled: a real link, not aria-current on a different pathname", () => {
    render(<BottomNav />);
    const conflictsLink = screen.getByRole("link", { name: "התנגשויות" });
    expect(conflictsLink).toHaveAttribute("href", "/conflicts");
    expect(conflictsLink).not.toHaveAttribute("aria-current");
  });

  it("marks /conflicts as the current page when that's the active pathname", () => {
    usePathname.mockReturnValue("/conflicts");
    render(<BottomNav />);
    const conflictsLink = screen.getByRole("link", { current: "page" });
    expect(conflictsLink).toHaveAttribute("href", "/conflicts");
  });

  it("the conflicts item's bottom-nav label matches its full nav label -- \"התנגשויות\" (Design Pass PR #22)", () => {
    render(<BottomNav />);
    expect(screen.getByText("התנגשויות")).toBeInTheDocument();
    expect(screen.queryByText("בדיקות")).toBeNull();
  });

  it("still disabled/manager-only routes (manager, reminders) are not part of the bottom nav at all", () => {
    render(<BottomNav />);
    expect(screen.queryByText("מנהל")).toBeNull();
  });

  it("renders exactly five bottom-nav items", () => {
    const { container } = render(<BottomNav />);
    expect(container.querySelectorAll("li").length).toBe(5);
  });

  it("marks /duties as the current page when that's the active pathname", () => {
    usePathname.mockReturnValue("/duties");
    render(<BottomNav />);
    const dutiesLink = screen.getByRole("link", { current: "page" });
    expect(dutiesLink).toHaveAttribute("href", "/duties");
  });

  it("marks /with-me as the current page when that's the active pathname", () => {
    usePathname.mockReturnValue("/with-me");
    render(<BottomNav />);
    const withMeLink = screen.getByRole("link", { current: "page" });
    expect(withMeLink).toHaveAttribute("href", "/with-me");
  });

  it("any currently-disabled bottom-nav entry would be marked aria-disabled, genuinely non-interactive", () => {
    const { container } = render(<BottomNav />);
    const disabled = container.querySelectorAll('[aria-disabled="true"]');
    disabled.forEach((el) => expect(el.tagName).not.toBe("A"));
  });
});
