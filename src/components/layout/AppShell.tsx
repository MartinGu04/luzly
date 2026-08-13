import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { MobileIdentityBar } from "./MobileIdentityBar";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
  person?: { name: string; isManager: boolean };
}

/**
 * Desktop: a right-side sidebar (the natural leading edge in RTL, achieved
 * simply by rendering it first in a `flex` row under `dir="rtl"` -- no
 * flex-row-reverse needed) plus a main column. Its `IdentityFooter` is the
 * desktop sign-out affordance. The sidebar is `sticky`/viewport-bound (see
 * `Sidebar`), so it never stretches down with tall page content -- this
 * outer row only needs `min-h-screen`, not any special alignment, since an
 * explicit-height flex item ignores the container's default stretch.
 *
 * Mobile/tablet: no sidebar at all -- a fixed bottom navigation bar instead
 * (see BottomNav), which has no identity slot of its own, so
 * `MobileIdentityBar` is the mobile sign-out affordance. Content gets
 * enough bottom padding to clear the bottom nav, including the iOS safe
 * area. Both render for every child, including the `configuration_error`
 * content state -- signing out must always be reachable.
 *
 * Content width: capped at 1440px (up from the old 1152px/`max-w-6xl`) so
 * large monitors get real usable canvas instead of a narrow centered
 * column with wasted space either side -- still with sensible horizontal
 * padding, not edge-to-edge.
 */
export function AppShell({ children, person }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar person={person} />
      <div className="flex min-h-screen w-full flex-1 flex-col">
        {person ? <MobileIdentityBar name={person.name} isManager={person.isManager} /> : null}
        <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-10">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
