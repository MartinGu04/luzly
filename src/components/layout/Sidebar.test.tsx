import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { Sidebar } from "./Sidebar";
import { navItems } from "./nav-items";

const usePathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

afterEach(() => {
  cleanup();
  usePathname.mockReturnValue("/");
});

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("Sidebar", () => {
  it("renders /duties, /schedule, /with-me, and / as real enabled links", () => {
    renderWithTheme(<Sidebar />);
    expect(screen.getByRole("link", { name: /תורנויות/ })).toHaveAttribute("href", "/duties");
    expect(screen.getByRole("link", { name: /לוח משמרות/ })).toHaveAttribute("href", "/schedule");
    expect(screen.getByRole("link", { name: /מי איתי/ })).toHaveAttribute("href", "/with-me");
    expect(screen.getByRole("link", { name: /לוח בקרה/ })).toHaveAttribute("href", "/");
  });

  it("marks /duties as the active route with aria-current", () => {
    usePathname.mockReturnValue("/duties");
    renderWithTheme(<Sidebar />);
    expect(screen.getByRole("link", { name: /תורנויות/ })).toHaveAttribute("aria-current", "page");
  });

  it("does not mark /duties as active when viewing a different route", () => {
    usePathname.mockReturnValue("/schedule");
    renderWithTheme(<Sidebar />);
    expect(screen.getByRole("link", { name: /תורנויות/ })).not.toHaveAttribute("aria-current");
  });

  it("marks /with-me as the active route with aria-current", () => {
    usePathname.mockReturnValue("/with-me");
    renderWithTheme(<Sidebar />);
    expect(screen.getByRole("link", { name: /מי איתי/ })).toHaveAttribute("aria-current", "page");
  });

  it("does not mark /with-me as active when viewing a different route", () => {
    usePathname.mockReturnValue("/duties");
    renderWithTheme(<Sidebar />);
    expect(screen.getByRole("link", { name: /מי איתי/ })).not.toHaveAttribute("aria-current");
  });

  it("still renders every disabled future route as a non-interactive placeholder", () => {
    renderWithTheme(<Sidebar />);
    const disabled = navItems.filter((item) => !item.enabled);
    expect(disabled.length).toBeGreaterThan(0);
    for (const item of disabled) {
      expect(screen.queryByRole("link", { name: item.label })).toBeNull();
    }
  });
});
