"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand/BrandMark";
import { visibleNavItems } from "./nav-items";
import { IdentityFooter } from "./IdentityFooter";

interface SidebarProps {
  person?: { name: string; isManager: boolean; avatarUrl: string | null };
}

/**
 * Desktop-only right-side navigation surface (renders first in the RTL flex
 * row -- see AppShell). Hidden below `lg`, where `BottomNav` takes over.
 *
 * A proper app-shell rail (Design Pass PR #19, widened + rebalanced in a
 * later refinement pass): `sticky top-0` with an explicit `h-dvh` so it
 * never stretches to match tall page content -- only the nav list itself
 * scrolls internally (`overflow-y-auto`) if it ever outgrows the viewport,
 * while the top identity block and `IdentityFooter` stay pinned to the
 * top/bottom of the viewport.
 *
 * The theme control lives in `IdentityFooter` now, not up here -- it reads
 * as part of the account/personal controls next to the user block instead
 * of a top-of-rail utility. There is exactly one theme control in the
 * sidebar at any time (never duplicated between top and bottom).
 */
export function Sidebar({ person }: SidebarProps) {
  const pathname = usePathname();
  const items = visibleNavItems(person?.isManager ?? false);

  return (
    <aside className="sticky top-0 hidden h-dvh w-[320px] shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex items-center justify-between gap-2 px-6 pt-7 pb-5">
        <BrandMark size="md" className="text-sidebar-foreground" />
        <button
          type="button"
          disabled
          aria-disabled="true"
          aria-label="התראות (בקרוב)"
          title="התראות -- בקרוב"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sidebar-muted opacity-60 disabled:cursor-not-allowed"
        >
          <Bell className="h-[16px] w-[16px]" aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-2" aria-label="ניווט ראשי">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.enabled && pathname === item.href;

          if (!item.enabled) {
            return (
              <div
                key={item.href}
                aria-disabled="true"
                className="flex min-h-[48px] items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-[15px] font-medium text-sidebar-muted opacity-70"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-[20px] w-[20px] opacity-70" aria-hidden="true" strokeWidth={1.75} />
                  {item.label}
                </span>
                <span className="rounded-full bg-sidebar-hover px-2 py-0.5 text-[10px] text-sidebar-muted">בקרוב</span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`group relative flex min-h-[48px] items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium transition-colors duration-200 ${
                isActive
                  ? "bg-sidebar-active text-sidebar-foreground ring-1 ring-sidebar-active-ring"
                  : "text-sidebar-foreground hover:bg-sidebar-hover"
              }`}
            >
              {isActive ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-1.5 end-0 w-[3px] rounded-full bg-primary"
                />
              ) : null}
              <Icon
                className={`h-[20px] w-[20px] shrink-0 ${isActive ? "text-primary" : "opacity-80"}`}
                aria-hidden="true"
                strokeWidth={1.75}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {person ? (
        <IdentityFooter name={person.name} isManager={person.isManager} avatarUrl={person.avatarUrl} />
      ) : null}
    </aside>
  );
}
