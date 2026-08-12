import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme/themeScript";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle", () => {
  it("renders System / Light / Dark as an accessible radiogroup of three radios", async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await screen.findByRole("radiogroup", { name: "ערכת נושא" });
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "מערכת" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "בהיר" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "כהה" })).toBeInTheDocument();
  });

  it("marks system as checked by default", async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await screen.findByRole("radiogroup");
    expect(screen.getByRole("radio", { name: "מערכת" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "בהיר" })).toHaveAttribute("aria-checked", "false");
  });

  it("clicking Light selects it and persists the choice", async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await screen.findByRole("radiogroup");

    act(() => {
      screen.getByRole("radio", { name: "בהיר" }).click();
    });

    expect(screen.getByRole("radio", { name: "בהיר" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "מערכת" })).toHaveAttribute("aria-checked", "false");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("clicking Dark selects it and persists the choice", async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await screen.findByRole("radiogroup");

    act(() => {
      screen.getByRole("radio", { name: "כהה" }).click();
    });

    expect(screen.getByRole("radio", { name: "כהה" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("every option has a keyboard-focusable, labeled button (no icon-only mystery meat)", async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await screen.findByRole("radiogroup");
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.tagName).toBe("BUTTON");
      expect(radio).toHaveAccessibleName();
    }
  });
});
