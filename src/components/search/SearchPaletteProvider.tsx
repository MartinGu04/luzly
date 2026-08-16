"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { SearchReadModel } from "@/lib/readModels/searchTypes";
import { CommandPalette } from "./CommandPalette";

interface SearchPaletteContextValue {
  isAvailable: boolean;
  open: () => void;
}

const UNAVAILABLE_CONTEXT: SearchPaletteContextValue = { isAvailable: false, open: () => {} };

const SearchPaletteContext = createContext<SearchPaletteContextValue | null>(null);

/**
 * Trigger buttons (`Sidebar`, `MobileIdentityBar`) call this to open the
 * shared palette instance -- never own their own open/closed state.
 * Falls back to a safe "unavailable" value outside a `SearchPaletteProvider`
 * rather than throwing: `Sidebar`/`MobileIdentityBar`/`AppShell` are each
 * unit-tested and reused in isolation without the full authenticated-shell
 * provider tree, and search being absent there is just as legitimate a
 * state as `configuration_error` making it unavailable in production.
 */
export function useSearchPalette(): SearchPaletteContextValue {
  return useContext(SearchPaletteContext) ?? UNAVAILABLE_CONTEXT;
}

interface SearchPaletteProviderProps {
  children: ReactNode;
  searchReadModel: SearchReadModel | null;
}

/**
 * Owns the global command palette's open/closed state and the Cmd/Ctrl+K
 * shortcut -- mounted once around the whole authenticated app shell (see
 * `src/app/(app)/layout.tsx`, the same sibling-of-AppShell placement
 * `AppRevalidator` already established) so every trigger button anywhere
 * inside it shares ONE palette instance instead of each owning its own.
 *
 * `searchReadModel` is `null` only when the underlying shift-schedule
 * configuration is broken (`loadSearchReadModel`'s `configuration_error`
 * status) -- the palette is then simply unavailable (no trigger renders,
 * Cmd/Ctrl+K is a no-op) rather than showing a half-broken search
 * experience with no data to search.
 */
export function SearchPaletteProvider({ children, searchReadModel }: SearchPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isAvailable = searchReadModel !== null;

  const open = useCallback(() => {
    if (isAvailable) setIsOpen(true);
  }, [isAvailable]);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isAvailable) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setIsOpen((previous) => !previous);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAvailable]);

  return (
    <SearchPaletteContext.Provider value={{ isAvailable, open }}>
      {children}
      {searchReadModel ? <CommandPalette open={isOpen} onClose={close} model={searchReadModel} /> : null}
    </SearchPaletteContext.Provider>
  );
}
