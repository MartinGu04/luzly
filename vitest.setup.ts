import "@testing-library/jest-dom/vitest";

/**
 * jsdom does not implement `window.matchMedia` -- it's a real browser API,
 * not part of the DOM spec jsdom emulates. A baseline stub here (always
 * "no match", i.e. light) means any test that merely RENDERS something
 * depending on it (e.g. `useEffectiveTheme`) doesn't throw even if that
 * test never cares about the result. Tests that DO care about a specific
 * system preference (light/dark) override this per-test via
 * `vi.stubGlobal("matchMedia", ...)`.
 */
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
