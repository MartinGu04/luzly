"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme, type ThemePreference } from "@/lib/theme/ThemeProvider";

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: "system", label: "מערכת", icon: Monitor },
  { value: "light", label: "בהיר", icon: Sun },
  { value: "dark", label: "כהה", icon: Moon },
];

interface ThemeToggleProps {
  className?: string;
  /**
   * "default" reads against a light content surface (main content area,
   * `MobileIdentityBar`). "sidebar" reads against the always-dark-navy
   * `Sidebar` surface (Design Pass PR #19) -- same control, an inverted
   * track/active treatment so it never looks washed out on navy.
   */
  variant?: "default" | "sidebar";
}

/**
 * Compact Light/Dark/System segmented control. Presentation-only --
 * `setTheme` only ever touches a DOM attribute + localStorage, never the
 * schedule/domain layer. "System" reads as active until the real stored
 * preference syncs in (immediately after hydration, before paint --
 * `ThemeProvider` uses `useSyncExternalStore`, so this is never a wrong
 * guess, just the honest "not yet known" default).
 */
export function ThemeToggle({ className = "", variant = "default" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const isSidebar = variant === "sidebar";

  return (
    <div
      role="radiogroup"
      aria-label="ערכת נושא"
      className={`inline-flex items-center gap-0.5 rounded-full p-0.5 ${
        isSidebar ? "bg-sidebar-hover" : "bg-overlay-soft"
      } ${className}`}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={option.label}
            onClick={() => setTheme(option.value)}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              isSidebar
                ? isActive
                  ? "bg-sidebar-active text-sidebar-foreground"
                  : "text-sidebar-muted hover:text-sidebar-foreground"
                : isActive
                  ? "bg-surface-1 text-primary"
                  : "text-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-[15px] w-[15px]" aria-hidden="true" strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
