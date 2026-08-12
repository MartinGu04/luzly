import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
  person?: { name: string; isManager: boolean };
}

/**
 * Desktop: a right-side sidebar (the natural leading edge in RTL, achieved
 * simply by rendering it first in a `flex` row under `dir="rtl"` -- no
 * flex-row-reverse needed) plus a main column.
 *
 * Mobile/tablet: no sidebar at all -- a fixed bottom navigation bar instead
 * (see BottomNav). Content gets enough bottom padding to clear it,
 * including the iOS safe area.
 */
export function AppShell({ children, person }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar person={person} />
      <div className="flex min-h-screen w-full flex-1 flex-col">
        <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
