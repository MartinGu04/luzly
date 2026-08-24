"use client";

import { useEffect, useState } from "react";
import { ManagerRecentBroadcastsSection } from "@/components/manager/ManagerRecentBroadcastsSection";
import { listActiveScheduledBroadcastsAction } from "@/lib/notifications/scheduledBroadcastActions";

/** Same ~17s cadence as `ManagerScheduledBroadcastsSection`'s own poll -- this signal watches the exact same underlying state. */
const ACTIVE_SIGNAL_POLL_INTERVAL_MS = 17_000;

/**
 * "היסטוריה" -- reuses the existing "נשלחו לאחרונה" list outright, never a
 * new history table or backend source.
 *
 * The old combined communication screen gated this list's own live-update
 * polling on whether a LIVE SIBLING "🕒 התראות מתוזמנות" list -- rendered on
 * the SAME screen -- currently reported any active (not-yet-dispatched)
 * items, so a background worker dispatch would be reflected here without a
 * manual refresh. That sibling now lives on a DIFFERENT Notification Center
 * section ("תזמון"), never mounted at the same time as this one -- so this
 * component asks the SAME underlying signal directly
 * (`listActiveScheduledBroadcastsAction()`, the exact action
 * `ManagerScheduledBroadcastsSection` itself already polls) rather than
 * either (a) polling "נשלחו לאחרונה" unconditionally forever, or (b)
 * silently losing the "still updates live while something might dispatch"
 * behavior.
 *
 * Same self-stopping cadence as `ManagerScheduledBroadcastsSection`'s own
 * poll -- a chained `setTimeout` (never `setInterval`, so overlapping
 * requests are structurally impossible) that only reschedules itself while
 * there's still something active to watch; once nothing is active, no
 * further poll is scheduled at all, so this is never aggressive/permanent
 * background polling -- it only runs while there is genuinely something
 * in flight. A thrown failure retries (unknown is not empty, same
 * reasoning `ManagerScheduledBroadcastsSection` already documents); a
 * clean but unauthorized result degrades to "nothing active" and stops,
 * never a page-breaking error here (`ManagerRecentBroadcastsSection` below
 * independently re-derives its own authorization and shows its own error
 * state if that fails too).
 */
export function NotificationHistorySection() {
  const [hasActiveScheduledBroadcasts, setHasActiveScheduledBroadcasts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const result = await listActiveScheduledBroadcastsAction();
        if (cancelled) return;
        if (result.ok) {
          const active = result.items.length > 0;
          setHasActiveScheduledBroadcasts(active);
          if (active) timeoutId = setTimeout(poll, ACTIVE_SIGNAL_POLL_INTERVAL_MS);
        } else {
          setHasActiveScheduledBroadcasts(false);
        }
      } catch {
        if (!cancelled) timeoutId = setTimeout(poll, ACTIVE_SIGNAL_POLL_INTERVAL_MS);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  return <ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={hasActiveScheduledBroadcasts} />;
}
