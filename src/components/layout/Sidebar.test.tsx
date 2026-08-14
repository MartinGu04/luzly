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

  it("no navItems entry is disabled anymore -- every rendered item is a real link (sidebar/mobile-nav refinement pass)", () => {
    renderWithTheme(<Sidebar />);
    expect(navItems.every((item) => item.enabled)).toBe(true);
    expect(screen.queryByText("בקרוב")).toBeNull();
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

    it("neither the removed reminders item nor the removed sync item ever renders, for a manager either", () => {
      renderWithTheme(<Sidebar person={{ name: "דני מנהל", isManager: true }} />);
      expect(screen.queryByRole("link", { name: "תזכורות" })).toBeNull();
      expect(screen.queryByText("תזכורות")).toBeNull();
      expect(screen.queryByRole("link", { name: "סנכרון" })).toBeNull();
      expect(screen.queryByText("סנכרון")).toBeNull();
    });
  });
});

describe("Sidebar — width and layout", () => {
  it("uses the widened 320px rail (sidebar/mobile-nav refinement pass)", () => {
    const { container } = renderWithTheme(<Sidebar />);
    const aside = container.querySelector("aside");
    expect(aside?.className).toMatch(/\bw-\[320px\]/);
  });
});

describe("Sidebar — theme control placement (sidebar/mobile-nav refinement pass)", () => {
  it("renders no theme control at the top of the rail when no person is provided", () => {
    renderWithTheme(<Sidebar />);
    expect(screen.queryByRole("radiogroup", { name: "ערכת נושא" })).toBeNull();
  });

  it("renders exactly one theme control, in the bottom identity/footer area, when a person is provided", () => {
    renderWithTheme(<Sidebar person={{ name: "דני בדיקה", isManager: false }} />);
    const toggles = screen.getAllByRole("radiogroup", { name: "ערכת נושא" });
    expect(toggles).toHaveLength(1);

    // Confirm it lives inside the footer, alongside the sign-out button and version text -- not up near the logo/bell.
    const footer = screen.getByRole("button", { name: "התנתקות" }).closest("div.border-t");
    expect(footer?.contains(toggles[0])).toBe(true);
  });
});
