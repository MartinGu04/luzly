import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme/themeScript";
import { MobileProfileMenu } from "./MobileProfileMenu";

function mockMatchMedia(prefersDark: boolean) {
  const listeners = new Set<(event: Partial<MediaQueryListEvent>) => void>();
  const mql = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: string, listener: (event: Partial<MediaQueryListEvent>) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: Partial<MediaQueryListEvent>) => void) => {
      listeners.delete(listener);
    },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => mql),
  );
  return mql;
}

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  mockMatchMedia(false); // system defaults to light unless a test says otherwise
});

describe("MobileProfileMenu — trigger", () => {
  it("the Avatar is a real button with an accessible name and popup semantics, closed by default", () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    const trigger = screen.getByRole("button", { name: "תפריט פרופיל של דני בדיקה" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens the menu on click, and toggles aria-expanded", () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    const trigger = screen.getByRole("button", { name: "תפריט פרופיל של דני בדיקה" });

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("MobileProfileMenu — identity block", () => {
  it("shows the user's name inside the open menu", () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    expect(screen.getByText("דני בדיקה")).toBeInTheDocument();
  });

  it("never renders an email anywhere in the menu", () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    const menu = screen.getByRole("menu");
    expect(menu.textContent).not.toContain("@");
  });
});

describe("MobileProfileMenu — manager access", () => {
  it('a manager sees "אזור מנהל", linking to /manager', () => {
    renderWithTheme(<MobileProfileMenu name="נועה מנהלת" isManager={true} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    const link = screen.getByRole("menuitem", { name: "אזור מנהל" });
    expect(link).toHaveAttribute("href", "/manager");
    expect(screen.getByText("מנהל/ת")).toBeInTheDocument();
  });

  it('a manager ALSO sees "מרכז התראות", linking to /notifications', () => {
    renderWithTheme(<MobileProfileMenu name="נועה מנהלת" isManager={true} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    const link = screen.getByRole("menuitem", { name: "מרכז התראות" });
    expect(link).toHaveAttribute("href", "/notifications");
  });

  it("both manager-only entries appear together, as separate menu items", () => {
    renderWithTheme(<MobileProfileMenu name="נועה מנהלת" isManager={true} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    expect(screen.getByRole("menuitem", { name: "אזור מנהל" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "מרכז התראות" })).toBeInTheDocument();
  });

  it("a non-manager never sees either manager-only entry", () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    expect(screen.queryByRole("menuitem", { name: "אזור מנהל" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "מרכז התראות" })).toBeNull();
    expect(screen.queryByText("מנהל/ת")).toBeNull();
  });
});

describe("MobileProfileMenu — single-button theme toggle", () => {
  it('when the system currently resolves dark, offers "עבור למצב בהיר" and switches to explicit light on click', () => {
    mockMatchMedia(true);
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));

    const toggle = screen.getByRole("menuitem", { name: "עבור למצב בהיר" });
    fireEvent.click(toggle);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it('when the system currently resolves light, offers "עבור למצב כהה" and switches to explicit dark on click', () => {
    mockMatchMedia(false);
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));

    const toggle = screen.getByRole("menuitem", { name: "עבור למצב כהה" });
    fireEvent.click(toggle);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("an explicit stored dark preference (not system) also offers the light-switch action", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    expect(screen.getByRole("menuitem", { name: "עבור למצב בהיר" })).toBeInTheDocument();
  });

  it("keeps the menu open after toggling theme", () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "עבור למצב כהה" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("never renders the 3-option system/light/dark segmented control inside the menu", () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText("מערכת")).toBeNull();
  });
});

describe("MobileProfileMenu — settings link", () => {
  it('every user sees "הגדרות", linking to /settings', () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    const link = screen.getByRole("menuitem", { name: "הגדרות" });
    expect(link).toHaveAttribute("href", "/settings");
  });
});

describe("MobileProfileMenu — logout", () => {
  it("logout remains reachable inside the menu", () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    expect(screen.getByRole("menuitem", { name: "התנתקות" })).toBeInTheDocument();
  });
});

describe("MobileProfileMenu — dismiss behavior", () => {
  it("Escape closes the menu and returns focus to the trigger", () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    const trigger = screen.getByRole("button", { name: /תפריט פרופיל/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("a pointerdown outside the menu closes it", () => {
    renderWithTheme(
      <div>
        <MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />
        <button type="button">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a pointerdown inside the menu does not close it", () => {
    renderWithTheme(<MobileProfileMenu name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /תפריט פרופיל/ }));
    const menu = screen.getByRole("menu");

    fireEvent.pointerDown(menu);

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
