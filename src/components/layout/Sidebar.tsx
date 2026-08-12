"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/config/productName";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { navItems } from "./nav-items";
import { IdentityFooter } from "./IdentityFooter";

interface SidebarProps {
  person?: { name: string; isManager: boolean };
}

/**
 * Desktop-only right-side navigation surface (renders first in the RTL flex
 * row -- see AppShell). Hidden below `lg`, where `BottomNav` takes over.
 */
export function Sidebar({ person }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="relative hidden w-[264px] shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex items-center justify-between px-6 py-6">
        <span className="text-lg font-bold tracking-tight text-sidebar-foreground">{APP_NAME}</span>
        <ThemeToggle />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="ניווט ראשי">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.enabled && pathname === item.href;

          if (!item.enabled) {
            return (
              <div
                key={item.href}
                aria-disabled="true"
                className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-muted"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-[18px] w-[18px] opacity-60" aria-hidden="true" strokeWidth={1.75} />
                  {item.label}
                </span>
                <span className="rounded-full bg-overlay-soft px-2 py-0.5 text-[10px] text-sidebar-muted">בקרוב</span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                isActive
                  ? "bg-overlay-strong text-sidebar-foreground"
                  : "text-sidebar-foreground hover:bg-overlay-soft"
              }`}
            >
              {isActive ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-1.5 end-0 w-[3px] rounded-full bg-primary"
                />
              ) : null}
              <Icon
                className={`h-[18px] w-[18px] ${isActive ? "text-primary" : "opacity-80"}`}
                aria-hidden="true"
                strokeWidth={1.75}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {person ? <IdentityFooter name={person.name} isManager={person.isManager} /> : null}
    </aside>
  );
}
