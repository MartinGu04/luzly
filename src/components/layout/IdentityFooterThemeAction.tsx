"use client";

import { Moon, Sun } from "lucide-react";
import { useEffectiveTheme, useTheme } from "@/lib/theme/ThemeProvider";

/**
 * The desktop `IdentityFooter`'s theme control (sidebar/mobile-nav
 * refinement pass, "one action" follow-up) -- deliberately NOT the
 * 3-option `ThemeToggle`: one compact button whose icon/label reflect the
 * current RESOLVED appearance (`useEffectiveTheme`, so "system" is
 * resolved to an actual light/dark before deciding which way to offer),
 * and a click sets the explicit opposite. This is the only theme control
 * IdentityFooter renders -- kept as its own small client component so the
 * server-rendered `IdentityFooter` itself doesn't need "use client" just
 * for this one interactive piece (same reasoning as `Avatar`).
 */
export function IdentityFooterThemeAction() {
  const { setTheme } = useTheme();
  const effectiveTheme = useEffectiveTheme();

  const Icon = effectiveTheme === "dark" ? Sun : Moon;
  const label = effectiveTheme === "dark" ? "מצב בהיר" : "מצב כהה";

  return (
    <button
      type="button"
      onClick={() => setTheme(effectiveTheme === "dark" ? "light" : "dark")}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-sidebar-muted transition-colors duration-200 hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Icon className="h-[14px] w-[14px]" aria-hidden="true" strokeWidth={1.75} />
      {label}
    </button>
  );
}
