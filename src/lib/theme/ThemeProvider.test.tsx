import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider, useEffectiveTheme, useTheme } from "./ThemeProvider";
import { THEME_STORAGE_KEY } from "./themeScript";

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
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  mockMatchMedia(false);
});

function Consumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <p data-testid="theme">{theme}</p>
      <button type="button" onClick={() => setTheme("light")}>
        light
      </button>
      <button type="button" onClick={() => setTheme("dark")}>
        dark
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        system
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  it("defaults to system when nothing is stored", () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("reads an already-stored explicit preference immediately", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("choosing light persists it and sets data-theme on <html>", () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    act(() => {
      screen.getByText("light").click();
    });

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("choosing dark persists it and sets data-theme on <html>", () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    act(() => {
      screen.getByText("dark").click();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("choosing system clears both the stored key and the DOM attribute", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    document.documentElement.setAttribute("data-theme", "dark");

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    act(() => {
      screen.getByText("system").click();
    });

    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("keeps two mounted consumers in sync when the theme changes", () => {
    render(
      <ThemeProvider>
        <Consumer />
        <Consumer />
      </ThemeProvider>,
    );

    act(() => {
      screen.getAllByText("dark")[0].click();
    });

    for (const el of screen.getAllByTestId("theme")) {
      expect(el).toHaveTextContent("dark");
    }
  });

  it("throws a clear error when useTheme is used outside a ThemeProvider", () => {
    function Broken() {
      useTheme();
      return null;
    }
    expect(() => render(<Broken />)).toThrow("useTheme must be used within a ThemeProvider");
  });
});

function EffectiveConsumer() {
  const effective = useEffectiveTheme();
  return <p data-testid="effective">{effective}</p>;
}

describe("useEffectiveTheme", () => {
  it('an explicit "dark" preference resolves to "dark" regardless of the system preference', () => {
    mockMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<EffectiveConsumer />);
    expect(screen.getByTestId("effective")).toHaveTextContent("dark");
  });

  it('an explicit "light" preference resolves to "light" regardless of the system preference', () => {
    mockMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<EffectiveConsumer />);
    expect(screen.getByTestId("effective")).toHaveTextContent("light");
  });

  it('"system" resolves to "dark" when the OS currently prefers dark', () => {
    mockMatchMedia(true);
    render(<EffectiveConsumer />);
    expect(screen.getByTestId("effective")).toHaveTextContent("dark");
  });

  it('"system" resolves to "light" when the OS currently prefers light', () => {
    mockMatchMedia(false);
    render(<EffectiveConsumer />);
    expect(screen.getByTestId("effective")).toHaveTextContent("light");
  });

  it("only ever renders exactly light or dark, never system, as an actual value", () => {
    mockMatchMedia(false);
    render(<EffectiveConsumer />);
    const value = screen.getByTestId("effective").textContent;
    expect(["light", "dark"]).toContain(value);
  });
});
