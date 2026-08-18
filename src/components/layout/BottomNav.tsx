"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { navItems, type NavItem } from "./nav-items";

/**
 * Reports the enclosing `<Link>`'s own pending-navigation state up to
 * `BottomNavLink`. `useLinkStatus` must be called from a component that is
 * itself a DESCENDANT of `<Link>` -- never the `<Link>` (or an ancestor)
 * directly -- so this tiny watcher exists purely to bridge that state
 * upward via a callback. Renders nothing.
 */
function LinkPendingWatcher({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  return null;
}

interface BottomNavLinkProps {
  item: NavItem;
  isActive: boolean;
}

/**
 * One enabled bottom-nav destination. Tracks its OWN pending-navigation
 * state via `useLinkStatus` -- Next's real pending-transition signal for
 * this exact tap, not a client-only guess -- so a tap gets immediate,
 * per-item feedback (icon swaps to a small spinner, the link becomes
 * `aria-busy`) without turning the whole bar into a wall of spinners:
 * every OTHER item stays exactly as it was. A second tap on an
 * already-pending destination is a no-op (`preventDefault`) rather than
 * firing a redundant second navigation to the same place.
 */
function BottomNavLink({ item, isActive }: BottomNavLinkProps) {
  const [pending, setPending] = useState(false);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      aria-busy={pending}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
      className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-sidebar-muted transition-colors duration-200 active:scale-95 active:opacity-80"
    >
      <LinkPendingWatcher onPendingChange={setPending} />
      <span
        aria-hidden="true"
        className={`absolute top-1 h-1 w-6 rounded-full bg-sidebar-accent transition-all duration-300 ${
          isActive ? "opacity-100" : "opacity-0"
        }`}
      />
      {pending ? (
        <Loader2 className="h-[21px] w-[21px] animate-spin text-sidebar-accent" aria-hidden="true" strokeWidth={2} />
      ) : (
        <Icon
          className={`h-[21px] w-[21px] transition-colors duration-200 ${isActive ? "text-sidebar-accent" : ""}`}
          aria-hidden="true"
          strokeWidth={isActive ? 2 : 1.75}
        />
      )}
      <span
        className={`text-[11px] font-medium leading-none transition-colors duration-200 ${
          isActive ? "text-sidebar-foreground" : ""
        }`}
      >
        {item.shortLabel}
      </span>
    </Link>
  );
}

/**
 * Premium bottom navigation for mobile/tablet, replacing the old
 * hamburger/drawer pattern entirely. Only a small curated set of routes
 * appears here (`inBottomNav`) to stay uncluttered; disabled items are
 * visibly present but genuinely non-interactive -- never a dead link.
 */
export function BottomNav() {
  const pathname = usePathname();
  const items = navItems.filter((item) => item.inBottomNav);

  return (
    <nav
      aria-label="ניווט תחתון"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {items.map((item) => {
          const isActive = item.enabled && pathname === item.href;

          if (!item.enabled) {
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex flex-1">
                <div
                  aria-disabled="true"
                  className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-sidebar-muted opacity-60"
                >
                  <Icon className="h-[20px] w-[20px]" aria-hidden="true" strokeWidth={1.75} />
                  <span className="text-[10.5px] font-medium leading-none">{item.shortLabel}</span>
                </div>
              </li>
            );
          }

          return (
            <li key={item.href} className="flex flex-1">
              <BottomNavLink item={item} isActive={isActive} />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
