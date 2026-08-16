"use client";

import { Search } from "lucide-react";
import { useSearchPalette } from "./SearchPaletteProvider";

interface SearchTriggerButtonProps {
  variant: "sidebar" | "mobile";
}

/**
 * Opens the shared command palette (`SearchPaletteProvider`) -- renders
 * nothing when search data isn't available (`configuration_error`), rather
 * than a dead/disabled button. Two visual variants, matching the exact
 * slots `NotificationBell` already established: a full-width row in
 * `Sidebar`'s top block, a compact icon button in `MobileIdentityBar`'s
 * [Bell, Avatar] cluster.
 */
export function SearchTriggerButton({ variant }: SearchTriggerButtonProps) {
  const { isAvailable, open } = useSearchPalette();
  if (!isAvailable) return null;

  if (variant === "sidebar") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="חיפוש"
        className="flex w-full items-center justify-between gap-2 rounded-xl bg-sidebar-hover/60 px-3.5 py-2.5 text-sm text-sidebar-muted ring-1 ring-sidebar-border transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
          חיפוש
        </span>
        <kbd className="rounded-md bg-sidebar-hover px-1.5 py-0.5 text-[11px] font-medium text-sidebar-muted">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label="חיפוש"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Search className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.75} />
    </button>
  );
}
