"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { getRecentManagerBroadcastsAction, type RecentManagerBroadcastView } from "@/lib/notifications/manualBroadcastActions";

interface ManagerRecentBroadcastsSectionProps {
  /** Bumped by the parent after any dispatch (immediate send, or a scheduled broadcast's "שלח עכשיו"/worker dispatch) so this list stays current. */
  reloadToken: number;
}

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
export function ManagerRecentBroadcastsSection({ reloadToken }: ManagerRecentBroadcastsSectionProps) {
  const [items, setItems] = useState<RecentManagerBroadcastView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getRecentManagerBroadcastsAction();
        if (cancelled) return;
        if (result.ok) {
          setItems(result.items);
          setLoadError(null);
        } else {
          setLoadError(result.error);
        }
      } catch {
        if (!cancelled) setLoadError("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (loadError || items === null || items.length === 0) return null;

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
