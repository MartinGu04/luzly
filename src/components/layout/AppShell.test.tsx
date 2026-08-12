import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(() => {
  cleanup();
});

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("AppShell — mobile identity/sign-out", () => {
  it("renders a mobile sign-out affordance alongside the desktop Sidebar's IdentityFooter", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false }}>
        <div>DASHBOARD_CONTENT</div>
      </AppShell>,
    );
    // Two sign-out buttons: one in the mobile identity bar, one in the desktop Sidebar's IdentityFooter.
    expect(screen.getAllByRole("button", { name: "התנתקות" })).toHaveLength(2);
  });

  it("the mobile identity bar shows the safe person name", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false }}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getAllByText("דני בדיקה").length).toBeGreaterThan(0);
  });

  it("shows the manager indication when isManager is true", () => {
    renderWithTheme(
      <AppShell person={{ name: "נועה דוגמה", isManager: true }}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getAllByText("מנהל/ת").length).toBeGreaterThan(0);
  });

  it("never renders an email anywhere in the shell", () => {
    const { container } = renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false }}>
        <div>content</div>
      </AppShell>,
    );
    expect(container.textContent).not.toContain("@");
  });

  it("remains available around configuration_error content (any children), not just the real dashboard", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false }}>
        <div>לא ניתן לחשב כרגע את שעות המשמרות</div>
      </AppShell>,
    );
    expect(screen.getByText("לא ניתן לחשב כרגע את שעות המשמרות")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "התנתקות" }).length).toBeGreaterThan(0);
  });

  it("renders no identity/sign-out affordance when no person is provided", () => {
    renderWithTheme(<AppShell>{null}</AppShell>);
    expect(screen.queryByRole("button", { name: "התנתקות" })).toBeNull();
  });

  it("keeps the bottom navigation -- no hamburger drawer reappears", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false }}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByRole("navigation", { name: "ניווט תחתון" })).toBeInTheDocument();
    expect(screen.queryByLabelText("פתיחת תפריט")).toBeNull();
  });
});

describe("AppShell — theme control", () => {
  it("renders the theme toggle in both the desktop sidebar and the mobile identity bar", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false }}>
        <div>content</div>
      </AppShell>,
    );
    // Two radiogroups: one in Sidebar, one in MobileIdentityBar.
    expect(screen.getAllByRole("radiogroup", { name: "ערכת נושא" })).toHaveLength(2);
  });
});
