"use client";

import { useState } from "react";
import Link from "next/link";
import { navItems } from "./nav-items";
import { IdentityFooter } from "./IdentityFooter";

interface MobileNavProps {
  person?: { name: string; isManager: boolean };
}

export function MobileNav({ person }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <header className="flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground">
        <span className="text-lg font-bold text-white">Luzly</span>
        <button
          type="button"
          aria-label="פתיחת תפריט"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg p-2 text-sidebar-foreground hover:bg-white/10"
        >
          <span className="block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="סגירת תפריט"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/40"
          />
          <div className="flex w-64 flex-col bg-sidebar text-sidebar-foreground">
            <nav className="flex flex-1 flex-col gap-1 p-3">
              {navItems.map((item) =>
                item.enabled ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/10"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <div
                    key={item.href}
                    aria-disabled="true"
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted"
                  >
                    <span>{item.label}</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-sidebar-muted">
                      בקרוב
                    </span>
                  </div>
                ),
              )}
            </nav>
            {person ? <IdentityFooter name={person.name} isManager={person.isManager} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
