/**
 * The localStorage key holding the user's EXPLICIT theme choice
 * ("light" | "dark"). No key (or any other value) means "system" --
 * follow `prefers-color-scheme`, handled entirely by the CSS media query
 * in globals.css. Shared between the blocking init script below and
 * `ThemeProvider` so both agree on the same storage contract.
 */
export const THEME_STORAGE_KEY = "app-theme";

/**
 * A tiny, synchronous script string, inlined as the very first thing in
 * `<body>` (see the root layout) so it runs and sets `data-theme` on
 * `<html>` before the browser paints anything -- this is what avoids a
 * flash of the wrong theme. It only ever sets a DOM attribute; no React
 * component renders differently based on it, so there is nothing for
 * hydration to disagree about.
 *
 * Deliberately does nothing (leaves `data-theme` unset) for "system" or a
 * missing/invalid stored value -- the `@media (prefers-color-scheme)`
 * rule in globals.css handles that case on its own, including live
 * updates if the OS theme changes while the page is open.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
