"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { THEME_STORAGE_KEY } from "./themeScript";

export type ThemePreference = "system" | "light" | "dark";

interface ThemeContextValue {
  /** The user's stored preference -- "system" means follow prefers-color-scheme. */
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * A minimal same-tab pub/sub so every `useTheme()` consumer re-renders
 * when `setTheme` changes the stored preference -- `useSyncExternalStore`
 * needs a subscribe function, and localStorage's own `storage` event
 * deliberately never fires in the tab that made the change.
 */
let listeners: Array<() => void> = [];

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * The SSR/pre-hydration snapshot -- always "system", since the server
 * (and the client's very first hydration pass) can never know a
 * localStorage-only preference. `useSyncExternalStore` guarantees this
 * exact value is used for both the server render and the client's first
 * render, so there is no hydration mismatch; it then automatically
 * re-renders with the real client snapshot immediately after hydration,
 * with no manual "mounted" bookkeeping and no `setState` inside an effect.
 */
function getServerSnapshot(): ThemePreference {
  return "system";
}

function applyThemeAttribute(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

/**
 * Presentation-only theme state -- never touches the schedule/domain
 * layer, never becomes part of any request payload. The actual paint
 * (colors) is 100% CSS, driven by the `data-theme` attribute this sets on
 * `<html>`; React only tracks the preference for the theme control's own
 * UI (which option is highlighted) and persists it to localStorage.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, getServerSnapshot);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode, quota) -- the theme
      // still applies for this session via the DOM attribute below.
    }
    applyThemeAttribute(next);
    notifyListeners();
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
