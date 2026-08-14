import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { AppShell } from "./AppShell";

/** Opens the mobile header's profile menu, which now hides the sign-out affordance/theme action until the Avatar trigger is clicked. */
function openMobileProfileMenu() {
  fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
}

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(() => {
  cleanup();
});

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("AppShell — mobile identity/sign-out", () => {
  it("the desktop Sidebar's sign-out is immediately visible; the mobile one is reachable behind the profile menu", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
        <div>DASHBOARD_CONTENT</div>
      </AppShell>,
    );
    // Only the desktop IdentityFooter's sign-out is visible before the mobile profile menu opens.
    expect(screen.getAllByRole("button", { name: "התנתקות" })).toHaveLength(1);
    expect(screen.queryByRole("menuitem", { name: "התנתקות" })).toBeNull();

    openMobileProfileMenu();

    // Once open, the mobile profile menu's own sign-out (role="menuitem") joins the desktop one (role="button").
    expect(screen.getAllByRole("button", { name: "התנתקות" })).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: "התנתקות" })).toBeInTheDocument();
  });

  it("the safe person name is reachable via the mobile profile menu, not permanently in the header", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
        <div>content</div>
      </AppShell>,
    );
    openMobileProfileMenu();
    expect(screen.getAllByText("דני בדיקה").length).toBeGreaterThan(0);
  });

  it("shows the manager indication when isManager is true", () => {
    renderWithTheme(
      <AppShell person={{ name: "נועה דוגמה", isManager: true, avatarUrl: null }}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getAllByText("מנהל/ת").length).toBeGreaterThan(0);
  });

  it("never renders an email anywhere in the shell", () => {
    const { container } = renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
        <div>content</div>
      </AppShell>,
    );
    expect(container.textContent).not.toContain("@");
  });

  it("remains available around configuration_error content (any children), not just the real dashboard", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
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
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByRole("navigation", { name: "ניווט תחתון" })).toBeInTheDocument();
    expect(screen.queryByLabelText("פתיחת תפריט")).toBeNull();
  });
});

describe("AppShell — sign-out looks destructive", () => {
  it("gives every sign-out affordance a red/critical treatment in both themes", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
        <div>content</div>
      </AppShell>,
    );
    openMobileProfileMenu();

    const buttons = [
      ...screen.getAllByRole("button", { name: "התנתקות" }),
      ...screen.getAllByRole("menuitem", { name: "התנתקות" }),
    ];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.className).toMatch(/text-critical/);
      expect(button.className).toMatch(/hover:bg-critical/);
      // Never a hardcoded dark-only red -- always the theme-aware token.
      expect(button.className).not.toMatch(/#|rgb\(/);
    }
  });
});

describe("AppShell — shell utility bar / live clock (Design Pass PR #19)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders exactly one live clock, in Asia/Jerusalem time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T07:00:00.000Z")); // 10:00:00 in Asia/Jerusalem (UTC+3, DST)

    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }} initialClockTime="00:00:00">
        <div>content</div>
      </AppShell>,
    );
    const clocks = document.querySelectorAll("time");
    expect(clocks).toHaveLength(1);
    expect(clocks[0].textContent).toBe("10:00:00");
  });

  it("never crashes with no server-derived clock time (configuration_error shell render)", () => {
    expect(() =>
      renderWithTheme(
        <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }} initialClockTime={null}>
          <div>content</div>
        </AppShell>,
      ),
    ).not.toThrow();
  });

  it("omitting initialClockTime entirely behaves the same as null -- no crash", () => {
    expect(() =>
      renderWithTheme(
        <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
          <div>content</div>
        </AppShell>,
      ),
    ).not.toThrow();
  });
});

describe("AppShell — theme control", () => {
  it("never renders the 3-option ThemeToggle anywhere in the shell -- neither desktop sidebar nor mobile header", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.queryByRole("radiogroup")).toBeNull();

    openMobileProfileMenu();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("the desktop IdentityFooter offers a single binary light/dark action", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
        <div>content</div>
      </AppShell>,
    );
    // vitest.setup.ts's baseline matchMedia stub resolves to light -> offers to switch to dark.
    expect(screen.getByRole("button", { name: "מצב כהה" })).toBeInTheDocument();
  });

  it("the mobile profile menu offers a single binary light/dark action instead", () => {
    renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
        <div>content</div>
      </AppShell>,
    );
    openMobileProfileMenu();
    const toggle = screen.getByRole("menuitem", { name: /עבור למצב/ });
    expect(toggle).toBeInTheDocument();
  });
});

describe("AppShell — avatarUrl (presentation-only Google account photo)", () => {
  it("passes the same avatarUrl to both the desktop IdentityFooter and the mobile profile menu's Avatar", () => {
    const { container } = renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: "https://lh3.googleusercontent.com/a/photo.jpg" }}>
        <div>content</div>
      </AppShell>,
    );
    // Scoped to `data-testid="avatar-photo"` -- the shell also renders the
    // product's own BrandMark <img> (Sidebar + mobile header), which is a
    // brand asset, not a user avatar, and must never be confused with one
    // (see `lib/config/brandAssets.ts`).
    const images = container.querySelectorAll('[data-testid="avatar-photo"]');
    expect(images.length).toBeGreaterThanOrEqual(2); // desktop IdentityFooter + mobile header trigger
    for (const img of images) {
      expect(img).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/photo.jpg");
    }
  });

  it("falls back to initials everywhere when avatarUrl is null -- no broken-image icon", () => {
    const { container } = renderWithTheme(
      <AppShell person={{ name: "דני בדיקה", isManager: false, avatarUrl: null }}>
        <div>content</div>
      </AppShell>,
    );
    expect(container.querySelector('[data-testid="avatar-photo"]')).toBeNull();
    expect(screen.getAllByText("דב").length).toBeGreaterThan(0);
  });
});
