"use client";

import { Moon, Sun } from "lucide-react";
import { useEffectiveTheme, useTheme } from "@/lib/theme/ThemeProvider";

/**
 * The mobile top bar's own light/dark control (nav redesign pass) -- lives
 * next to `SearchTriggerButton` in `MobileIdentityBar`, mirroring the
 * desktop `IdentityFooterThemeAction`: icon-only, reflects the current
 * RESOLVED appearance (`useEffectiveTheme`, so "system" is resolved to an
 * actual light/dark first), and a click sets the explicit opposite. Reuses
 * the SAME `ThemeProvider` state every other theme control in this app
 * shares -- never a separate theme system. This moved out of
 * `MobileProfileMenu` (which used to hold the mobile theme toggle) so that
 * menu can stay account-only; this is now the ONLY theme control on
 * mobile, same "exactly one control" rule `IdentityFooter` already
 * documents for desktop.
 */
export function MobileTopBarThemeAction() {
  const { setTheme } = useTheme();
  const effectiveTheme = useEffectiveTheme();

  const Icon = effectiveTheme === "dark" ? Sun : Moon;
  const label = effectiveTheme === "dark" ? "מצב בהיר" : "מצב כהה";

  return (
    <button
      type="button"
      onClick={() => setTheme(effectiveTheme === "dark" ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Icon className="h-[16px] w-[16px]" aria-hidden="true" strokeWidth={1.75} />
    </button>
  );
}
