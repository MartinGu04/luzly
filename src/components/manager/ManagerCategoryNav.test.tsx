import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerCategoryNav } from "./ManagerCategoryNav";

afterEach(() => {
  cleanup();
});

const BASE = { range: "7d" as const, month: null };

describe("ManagerCategoryNav", () => {
  it("renders all five categories", () => {
    render(<ManagerCategoryNav active="overview" current={BASE} />);
    expect(screen.getByRole("tab", { name: "סקירה" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "משמרות" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "כוח אדם" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "תורנויות והיעדרויות" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "התחברויות והתראות" })).toBeInTheDocument();
  });

  it("overview is the omitted default -- its href is the bare /manager", () => {
    render(<ManagerCategoryNav active="overview" current={BASE} />);
    expect(screen.getByRole("tab", { name: "סקירה" })).toHaveAttribute("href", "/manager");
  });

  it("every other category links with an explicit ?category=", () => {
    render(<ManagerCategoryNav active="overview" current={BASE} />);
    expect(screen.getByRole("tab", { name: "משמרות" })).toHaveAttribute("href", "/manager?category=shifts");
    expect(screen.getByRole("tab", { name: "כוח אדם" })).toHaveAttribute("href", "/manager?category=personnel");
    expect(screen.getByRole("tab", { name: "תורנויות והיעדרויות" })).toHaveAttribute(
      "href",
      "/manager?category=duties",
    );
    expect(screen.getByRole("tab", { name: "התחברויות והתראות" })).toHaveAttribute(
      "href",
      "/manager?category=logins",
    );
  });

  it("marks only the active category as selected", () => {
    render(<ManagerCategoryNav active="shifts" current={BASE} />);
    expect(screen.getByRole("tab", { name: "משמרות" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "סקירה" })).toHaveAttribute("aria-selected", "false");
  });

  it("preserves the selected range/month, but never a person, when switching category", () => {
    render(<ManagerCategoryNav active="overview" current={{ range: "month", month: "2026-08" }} />);
    expect(screen.getByRole("tab", { name: "משמרות" })).toHaveAttribute(
      "href",
      "/manager?range=month&month=2026-08&category=shifts",
    );
  });

  it("every tab never wraps its own label onto a second line -- whitespace-nowrap, so a long two-word label can never read as a detached row", () => {
    render(<ManagerCategoryNav active="overview" current={BASE} />);
    for (const name of ["סקירה", "משמרות", "כוח אדם", "תורנויות והיעדרויות", "התחברויות והתראות"]) {
      expect(screen.getByRole("tab", { name })).toHaveClass("whitespace-nowrap");
    }
  });

  it("the tablist itself never wraps onto multiple flex lines -- no shrinking, no wrap, so it scrolls as one strip instead", () => {
    render(<ManagerCategoryNav active="overview" current={BASE} />);
    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveClass("inline-flex");
    expect(tablist.className).not.toMatch(/\bflex-wrap\b/);
    for (const name of ["סקירה", "משמרות", "כוח אדם", "תורנויות והיעדרויות", "התחברויות והתראות"]) {
      expect(screen.getByRole("tab", { name })).toHaveClass("shrink-0");
    }
  });

  it("the nav wrapper allows horizontal scrolling when the strip overflows", () => {
    render(<ManagerCategoryNav active="overview" current={BASE} />);
    expect(screen.getByRole("navigation", { name: "קטגוריות אזור מנהל" })).toHaveClass("overflow-x-auto");
  });
});
