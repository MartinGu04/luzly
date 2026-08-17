import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BottomNav } from "./BottomNav";
import { navItems } from "./nav-items";

const usePathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

const linkStatus = { pending: false };
vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => linkStatus };
});

afterEach(() => {
  cleanup();
  usePathname.mockReturnValue("/");
});

describe("BottomNav", () => {
  it("34. any disabled bottom-nav item renders no clickable link -- no dead routes", () => {
    render(<BottomNav />);
    // The curated bottom-nav set (/, /schedule, /duties) is fully enabled
    // today, so this may currently iterate zero items -- it's a
    // forward-looking safety net for whenever a future item is disabled.
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
    const scheduleLink = screen.getByRole("link", { name: "הלוח שלי" });
    expect(scheduleLink).toHaveAttribute("href", "/schedule");
    expect(scheduleLink).not.toHaveAttribute("aria-current");
  });

  it("the duties route is enabled: a real link, not aria-current on a different pathname", () => {
    render(<BottomNav />);
    const dutiesLink = screen.getByRole("link", { name: "תורנויות" });
    expect(dutiesLink).toHaveAttribute("href", "/duties");
    expect(dutiesLink).not.toHaveAttribute("aria-current");
  });

  it("the manager-only route is not part of the bottom nav at all", () => {
    render(<BottomNav />);
    expect(screen.queryByText("מנהל")).toBeNull();
  });

  it("renders exactly four bottom-nav items (PR #4 adds טבלת צדק)", () => {
    const { container } = render(<BottomNav />);
    expect(container.querySelectorAll("li").length).toBe(4);
  });

  it("the standalone Fairness route is a real link with its compact label", () => {
    render(<BottomNav />);
    const fairnessLink = screen.getByRole("link", { name: "צדק" });
    expect(fairnessLink).toHaveAttribute("href", "/fairness");
    expect(fairnessLink).not.toHaveAttribute("aria-current");
  });

  it("marks /fairness as the current page when that's the active pathname", () => {
    usePathname.mockReturnValue("/fairness");
    render(<BottomNav />);
    const current = screen.getByRole("link", { current: "page" });
    expect(current).toHaveAttribute("href", "/fairness");
  });

  it("marks /duties as the current page when that's the active pathname", () => {
    usePathname.mockReturnValue("/duties");
    render(<BottomNav />);
    const dutiesLink = screen.getByRole("link", { current: "page" });
    expect(dutiesLink).toHaveAttribute("href", "/duties");
  });

  it("no longer renders מי איתי or התנגשויות -- removed as standalone nav destinations", () => {
    render(<BottomNav />);
    expect(screen.queryByRole("link", { name: "מי איתי" })).toBeNull();
    expect(screen.queryByRole("link", { name: "התנגשויות" })).toBeNull();
  });

  it("any currently-disabled bottom-nav entry would be marked aria-disabled, genuinely non-interactive", () => {
    const { container } = render(<BottomNav />);
    const disabled = container.querySelectorAll('[aria-disabled="true"]');
    disabled.forEach((el) => expect(el.tagName).not.toBe("A"));
  });
});

describe("BottomNav — pending navigation feedback", () => {
  afterEach(() => {
    linkStatus.pending = false;
  });

  it("a non-pending link is not aria-busy and shows its normal icon, never a spinner", () => {
    const { container } = render(<BottomNav />);
    const scheduleLink = screen.getByRole("link", { name: "הלוח שלי" });
    expect(scheduleLink).toHaveAttribute("aria-busy", "false");
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("a link whose navigation is pending is aria-busy and shows a spinner instead of its normal icon", () => {
    linkStatus.pending = true;
    const { container } = render(<BottomNav />);
    const scheduleLink = screen.getByRole("link", { name: "הלוח שלי" });
    expect(scheduleLink).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("tapping an already-pending link does not fire a second, redundant navigation", () => {
    linkStatus.pending = true;
    render(<BottomNav />);
    const scheduleLink = screen.getByRole("link", { name: "הלוח שלי" });
    const notPrevented = fireEvent.click(scheduleLink);
    expect(notPrevented).toBe(false);
  });
});
