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
  it("renders /duties, /schedule, /with-me, /conflicts, and / as real enabled links", () => {
    renderWithTheme(<Sidebar />);
    expect(screen.getByRole("link", { name: /תורנויות/ })).toHaveAttribute("href", "/duties");
    expect(screen.getByRole("link", { name: /לוח משמרות/ })).toHaveAttribute("href", "/schedule");
    expect(screen.getByRole("link", { name: /מי איתי/ })).toHaveAttribute("href", "/with-me");
    expect(screen.getByRole("link", { name: /התנגשויות/ })).toHaveAttribute("href", "/conflicts");
    expect(screen.getByRole("link", { name: /לוח בקרה/ })).toHaveAttribute("href", "/");
  });

  it("marks /conflicts as the active route with aria-current", () => {
    usePathname.mockReturnValue("/conflicts");
    renderWithTheme(<Sidebar />);
    expect(screen.getByRole("link", { name: /התנגשויות/ })).toHaveAttribute("aria-current", "page");
  });

  it("does not mark /conflicts as active when viewing a different route", () => {
    usePathname.mockReturnValue("/duties");
    renderWithTheme(<Sidebar />);
    expect(screen.getByRole("link", { name: /התנגשויות/ })).not.toHaveAttribute("aria-current");
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

  describe("manager-only navigation", () => {
    it("a non-manager sees no /manager link at all -- not even disabled", () => {
      renderWithTheme(<Sidebar person={{ name: "דני עובד", isManager: false }} />);
      expect(screen.queryByRole("link", { name: /אזור מנהל/ })).toBeNull();
      expect(screen.queryByText("אזור מנהל")).toBeNull();
    });

    it("no person prop at all (defensive default) also hides /manager", () => {
      renderWithTheme(<Sidebar />);
      expect(screen.queryByText("אזור מנהל")).toBeNull();
    });

    it("a manager sees /manager as a real enabled link", () => {
      renderWithTheme(<Sidebar person={{ name: "דני מנהל", isManager: true }} />);
      const link = screen.getByRole("link", { name: /אזור מנהל/ });
      expect(link).toHaveAttribute("href", "/manager");
    });

    it("marks /manager as the active route with aria-current for a manager", () => {
      usePathname.mockReturnValue("/manager");
      renderWithTheme(<Sidebar person={{ name: "דני מנהל", isManager: true }} />);
      expect(screen.getByRole("link", { name: /אזור מנהל/ })).toHaveAttribute("aria-current", "page");
    });

    it("existing enabled routes remain visible for a manager too", () => {
      renderWithTheme(<Sidebar person={{ name: "דני מנהל", isManager: true }} />);
      expect(screen.getByRole("link", { name: /תורנויות/ })).toHaveAttribute("href", "/duties");
      expect(screen.getByRole("link", { name: /התנגשויות/ })).toHaveAttribute("href", "/conflicts");
    });

    it("/reminders remains a disabled placeholder for a manager too, and the removed sync item never renders", () => {
      renderWithTheme(<Sidebar person={{ name: "דני מנהל", isManager: true }} />);
      expect(screen.queryByRole("link", { name: "תזכורות" })).toBeNull();
      expect(screen.queryByRole("link", { name: "סנכרון" })).toBeNull();
      expect(screen.queryByText("סנכרון")).toBeNull();
    });
  });
});
