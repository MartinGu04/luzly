"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "./nav-items";

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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar/85 backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.enabled && pathname === item.href;

          if (!item.enabled) {
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
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-sidebar-muted transition-colors duration-200 active:scale-95 active:opacity-80"
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-1 h-1 w-6 rounded-full bg-primary transition-all duration-300 ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
                <Icon
                  className={`h-[21px] w-[21px] transition-colors duration-200 ${isActive ? "text-primary" : ""}`}
                  aria-hidden="true"
                  strokeWidth={isActive ? 2 : 1.75}
                />
                <span
                  className={`text-[10.5px] font-medium leading-none transition-colors duration-200 ${
                    isActive ? "text-sidebar-foreground" : ""
                  }`}
                >
                  {item.shortLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
