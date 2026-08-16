"use client";

import { Moon, Sun } from "lucide-react";
import { useEffectiveTheme, useTheme } from "@/lib/theme/ThemeProvider";

/**
 * The desktop `IdentityFooter`'s theme control (sidebar/mobile-nav
 * refinement pass, "one action" follow-up; icon-only per the PR #38 desktop
 * shell polish) -- deliberately NOT the 3-option `ThemeToggle`: one compact
 * button whose icon reflects the current RESOLVED appearance
 * (`useEffectiveTheme`, so "system" is resolved to an actual light/dark
 * before deciding which way to offer), and a click sets the explicit
 * opposite. Icon-only visually -- the action's name lives in `aria-label`
 * (so it's still exposed to assistive tech/tests exactly as before) and
 * `title` (a native hover tooltip), with a comfortable square hit target
 * despite the compact appearance. This change is desktop-only: mobile's own
 * theme control (`MobileProfileMenu`) is a separate component untouched by
 * this file. This is the only theme control IdentityFooter renders -- kept
 * as its own small client component so the server-rendered `IdentityFooter`
 * itself doesn't need "use client" just for this one interactive piece
 * (same reasoning as `Avatar`).
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
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-muted transition-colors duration-200 hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Icon className="h-[16px] w-[16px]" aria-hidden="true" strokeWidth={1.75} />
    </button>
  );
}
