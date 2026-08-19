"use client";

import { useEffect } from "react";
import { useLinkStatus } from "next/link";

/**
 * Reports the enclosing `<Link>`'s own pending-navigation state up to its
 * parent via a callback. `useLinkStatus` must be called from a component
 * that is itself a DESCENDANT of `<Link>` -- never the `<Link>` (or an
 * ancestor) directly -- so this tiny watcher exists purely to bridge that
 * state upward. Renders nothing.
 *
 * Extracted from `layout/Sidebar.tsx`/`layout/BottomNav.tsx`, which
 * previously each defined an identical copy of this component -- now the
 * ONE shared primitive, also used by `TabLink.tsx` for the Manager Area
 * and Fairness tab strips. Behavior is unchanged; this is a pure
 * de-duplication.
 */
export function LinkPendingWatcher({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  return null;
}
