"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { LinkPendingWatcher } from "./LinkPendingWatcher";

interface TabLinkProps {
  href: string;
  isActive: boolean;
  className: string;
  children: ReactNode;
  /** Forwarded to `next/link`'s own `scroll` prop -- e.g. a duty-period tab that shouldn't reset scroll position. Defaults to Next's own default (true). */
  scroll?: boolean;
}

/**
 * One `role="tab"` pill link with real, per-tab pending-navigation
 * feedback -- the same `useLinkStatus` mechanism `layout/Sidebar.tsx`/
 * `layout/BottomNav.tsx` already use for the app's main navigation
 * surfaces, extracted here so the Manager Area category strip
 * (`ManagerCategoryNav`) and the Fairness shift/duty mode toggle
 * (`FairnessModeToggle`) share ONE pending-state implementation instead
 * of two independent copies.
 *
 * `aria-busy` + a small inline spinner give a click INSTANT visual
 * acknowledgment even though these tabs stay on the same route segment
 * (`?category=`/`?mode=` only) -- a case Next's own `loading.tsx`
 * segment-level Suspense boundary structurally cannot cover, since no new
 * segment ever mounts for a searchParam-only change. The label text is
 * NEVER replaced by the spinner (the destination stays nameable, and the
 * tab strip never loses a tab or jumps to a skeleton) -- the spinner is a
 * small addition before the label, inside the tab's own existing pill,
 * so the surrounding page layout never shifts.
 *
 * A second click while already pending is a no-op (`preventDefault`),
 * exactly like Sidebar/BottomNav: the click was already accepted, and a
 * user tapping repeatedly can never queue up redundant navigations to the
 * same destination.
 */
export function TabLink({ href, isActive, className, children, scroll }: TabLinkProps) {
  const [pending, setPending] = useState(false);

  return (
    <Link
      href={href}
      scroll={scroll}
      role="tab"
      aria-selected={isActive}
      aria-busy={pending}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
      className={className}
    >
      <LinkPendingWatcher onPendingChange={setPending} />
      <span className="inline-flex items-center gap-1.5">
        {pending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" strokeWidth={2} /> : null}
        {children}
      </span>
    </Link>
  );
}
