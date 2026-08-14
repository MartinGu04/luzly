"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Moon, Sun, UserCog } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { Avatar } from "@/components/ui/Avatar";
import { useEffectiveTheme, useTheme } from "@/lib/theme/ThemeProvider";

interface MobileProfileMenuProps {
  name: string;
  isManager: boolean;
}

/**
 * The mobile header's profile trigger + dropdown (Design Pass PR #22
 * "mobile header polish"). Replaces the old `MobileIdentityBar` pattern of
 * showing name/role/manager-link/theme-control/logout permanently in the
 * header -- all of that now lives behind this single Avatar button, kept
 * as a lightweight custom popover (no menu/dropdown dependency).
 *
 * Uses only the already-safe `name`/`isManager` passed down from the app
 * shell (the same identity the request-scoped read model already
 * resolved) -- no email, no new fetch. Sign-out is still the plain
 * `signOutAction` form (works with no client JS); everything else here is
 * presentation-only, same as `ThemeToggle`/`IdentityFooter`.
 */
export function MobileProfileMenu({ name, isManager }: MobileProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const { setTheme } = useTheme();
  const effectiveTheme = useEffectiveTheme();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggleTheme() {
    setTheme(effectiveTheme === "dark" ? "light" : "dark");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`תפריט פרופיל של ${name}`}
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full transition-transform duration-150 hover:opacity-90 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Avatar name={name} size="sm" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="תפריט פרופיל"
          // Anchored to the trigger's END edge (physically its left edge in
          // RTL), not its start edge: the Avatar sits near the physical
          // LEFT edge of the screen (see MobileIdentityBar), so a
          // start-anchored popup would expand further left and run off the
          // viewport. Anchoring to `end-0` instead makes it expand
          // rightward, into the visible content area.
          className="absolute end-0 top-full z-50 mt-2 w-56 rounded-2xl bg-surface-1 p-1.5 shadow-[var(--shadow-hero)] ring-1 ring-border-strong"
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar name={name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              {isManager ? <p className="text-xs text-muted">מנהל/ת</p> : null}
            </div>
          </div>

          <div className="my-1 h-px bg-border" />

          {isManager ? (
            <Link
              href="/manager"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-overlay-soft"
            >
              <UserCog className="h-4 w-4 text-muted" aria-hidden="true" strokeWidth={1.75} />
              אזור מנהל
            </Link>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={toggleTheme}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-sm font-medium text-foreground transition-colors duration-150 hover:bg-overlay-soft"
          >
            {effectiveTheme === "dark" ? (
              <Sun className="h-4 w-4 text-muted" aria-hidden="true" strokeWidth={1.75} />
            ) : (
              <Moon className="h-4 w-4 text-muted" aria-hidden="true" strokeWidth={1.75} />
            )}
            {effectiveTheme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
          </button>

          <div className="my-1 h-px bg-border" />

          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-sm font-medium text-critical transition-colors duration-150 hover:bg-critical/10"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
              התנתקות
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
