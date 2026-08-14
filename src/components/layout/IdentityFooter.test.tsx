import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme/themeScript";
import { IdentityFooter } from "./IdentityFooter";
import { APP_VERSION } from "@/lib/config/appVersion";
import packageJson from "../../../package.json";

function mockMatchMedia(prefersDark: boolean) {
  const mql = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => mql),
  );
  return mql;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  mockMatchMedia(false);
});

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("IdentityFooter", () => {
  it("shows the person's name", () => {
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.getByText("דני בדיקה")).toBeInTheDocument();
  });

  it("shows the manager indication only when isManager is true", () => {
    const { rerender } = render(
      <ThemeProvider>
        <IdentityFooter name="דני בדיקה" isManager={false} avatarUrl={null} />
      </ThemeProvider>,
    );
    expect(screen.queryByText("מנהל/ת")).toBeNull();

    rerender(
      <ThemeProvider>
        <IdentityFooter name="נועה מנהלת" isManager={true} avatarUrl={null} />
      </ThemeProvider>,
    );
    expect(screen.getByText("מנהל/ת")).toBeInTheDocument();
  });

  it("renders a reachable sign-out button", () => {
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.getByRole("button", { name: "התנתקות" })).toBeInTheDocument();
  });

  it("never renders an email anywhere", () => {
    const { container } = renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(container.textContent).not.toContain("@");
  });

  it("shows the app version, sourced from the real package.json version", () => {
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(APP_VERSION).toBe(packageJson.version);
    expect(screen.getByText(new RegExp(packageJson.version.replace(/\./g, "\\.")))).toBeInTheDocument();
  });
});

describe("IdentityFooter — single-action theme control (not the 3-option ThemeToggle)", () => {
  it("never renders the 3-option system/light/dark segmented control", () => {
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText("מערכת")).toBeNull();
  });

  it('when the effective theme is dark, offers "מצב בהיר" and switches to explicit light on click', () => {
    mockMatchMedia(true);
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} avatarUrl={null} />);
    const action = screen.getByRole("button", { name: "מצב בהיר" });
    fireEvent.click(action);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it('when the effective theme is light, offers "מצב כהה" and switches to explicit dark on click', () => {
    mockMatchMedia(false);
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} avatarUrl={null} />);
    const action = screen.getByRole("button", { name: "מצב כהה" });
    fireEvent.click(action);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("exactly one theme control renders here", () => {
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} avatarUrl={null} />);
    const actions = [
      ...screen.queryAllByRole("button", { name: "מצב בהיר" }),
      ...screen.queryAllByRole("button", { name: "מצב כהה" }),
    ];
    expect(actions).toHaveLength(1);
  });
});

describe("IdentityFooter — avatar photo", () => {
  it("passes avatarUrl through to the Avatar (image element present when given a photo)", () => {
    const { container } = renderWithTheme(
      <IdentityFooter name="דני בדיקה" isManager={false} avatarUrl="https://lh3.googleusercontent.com/a/photo.jpg" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/photo.jpg");
  });

  it("renders initials, not a broken image, when avatarUrl is null", () => {
    const { container } = renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("דב")).toBeInTheDocument();
  });
});
