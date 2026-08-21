"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { getRecentManagerBroadcastsAction, type RecentManagerBroadcastView } from "@/lib/notifications/manualBroadcastActions";

interface ManagerRecentBroadcastsSectionProps {
  /** Bumped by the parent after any dispatch (immediate send, or a scheduled broadcast's "שלח עכשיו"/worker dispatch) so this list stays current. */
  reloadToken: number;
  /**
   * Whether `ManagerScheduledBroadcastsSection` currently reports at least
   * one active item -- this section only polls while that's true (spec
   * §7: "while the communication area has active scheduled broadcasts"),
   * since a background worker dispatch is the only kind of change that
   * could land here WITHOUT this manager's own action already bumping
   * `reloadToken`.
   */
  pollWhileActive: boolean;
}

/** Same ~15-20s cadence as `ManagerScheduledBroadcastsSection`'s own poll (spec §7). */
const POLL_INTERVAL_MS = 17_000;

function audienceLabel(item: RecentManagerBroadcastView): string {
  if (item.audienceKind === "everyone") return "כולם";
  return `${item.resolvedRecipientCount} אנשי צוות`;
}

/**
 * "נשלחו לאחרונה" -- reuses PR #78's own `getRecentManagerBroadcastsAction`
 * (a small, bounded read of `manager_notification_batches`, already
 * manager-gated and already tested) rather than building a second
 * history/archive system (spec §6). A scheduled broadcast that has
 * dispatched becomes an ordinary batch row here automatically -- nothing
 * scheduling-specific needs to be added to this query.
 */
export function ManagerRecentBroadcastsSection({ reloadToken, pollWhileActive }: ManagerRecentBroadcastsSectionProps) {
  const [items, setItems] = useState<RecentManagerBroadcastView[] | null>(null);

  // Always loads once on mount / whenever `reloadToken` bumps (a manager's
  // own action elsewhere). The chained setTimeout re-fetch beyond that is
  // gated entirely on `pollWhileActive` -- re-armed after each successful
  // load only while it's still true, so this stops polling the instant
  // `ManagerScheduledBroadcastsSection` reports no active items left
  // (spec §7's "pause when there are no active schedules"). Chaining
  // (never setInterval) keeps overlapping requests structurally
  // impossible, same reasoning as the scheduled section's own poll.
  //
  // A THROWN failure (network hiccup, transient 5xx, ...) is deliberately
  // NOT treated as "stop polling" while `pollWhileActive` is true -- same
  // reasoning as `ManagerScheduledBroadcastsSection`'s own fix: "unknown"
  // is not "empty", so this retries on the next normal interval rather
  // than dying silently until an unrelated `reloadToken`/`pollWhileActive`
  // change happens to resurrect it. Only a typed `result.ok === false`
  // (a genuinely permanent manager-auth state -- see
  // `loadManagerPersonnelContext`'s own docs for why that union can never
  // include a transient `configuration_error`) stops scheduling further
  // polls. Whenever `pollWhileActive` is false, no retry is ever
  // scheduled either way -- this section simply stays quiet until the
  // scheduled section reports active items again.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const result = await getRecentManagerBroadcastsAction();
        if (cancelled) return;
        if (result.ok) {
          setItems(result.items);
          if (pollWhileActive) {
            timeoutId = setTimeout(load, POLL_INTERVAL_MS);
          }
        }
        // A typed `result.ok === false` (a genuinely permanent manager-
        // auth state) simply stops here -- no retry scheduled, and
        // `items` is left exactly as it was (see the docstring above).
      } catch {
        if (!cancelled) {
          // Deliberately no early return / state wipe here -- `items`
          // (if anything was already loaded) is left completely
          // untouched, so a transient failure never makes an already-
          // visible "נשלחו לאחרונה" list disappear.
          if (pollWhileActive) {
            timeoutId = setTimeout(load, POLL_INTERVAL_MS);
          }
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [reloadToken, pollWhileActive]);

  // A transient background-poll failure must never hide already-loaded
  // items (see the effect's own docstring above) -- there is no error
  // state to gate on here at all, deliberately. `items === null`
  // (nothing has ever loaded successfully yet, including right after an
  // initial failure) and a genuine successful empty result both still
  // render nothing, exactly as before.
  if (items === null || items.length === 0) return null;

  return (
    <Panel variant="compact" data-testid="manager-recent-broadcasts">
      <h4 className="text-sm font-semibold text-foreground">נשלחו לאחרונה</h4>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg bg-overlay-faint p-2.5 ring-1 ring-border">
            <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
            <p className="mt-0.5 text-xs text-muted">
              {audienceLabel(item)} · נשלח ע״י {item.createdByPersonName}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
