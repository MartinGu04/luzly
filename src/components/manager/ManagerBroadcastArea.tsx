"use client";

import { useState } from "react";
import { ManagerBroadcastComposer } from "./ManagerBroadcastComposer";
import { ManagerFixedNotificationsSection } from "./ManagerFixedNotificationsSection";
import { ManagerRecentBroadcastsSection } from "./ManagerRecentBroadcastsSection";
import { ManagerScheduledBroadcastsSection } from "./ManagerScheduledBroadcastsSection";
import type { ScheduledBroadcastView } from "@/lib/notifications/scheduledBroadcastActions";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";

interface ManagerBroadcastAreaProps {
  roster: ManagerPersonSummary[];
  adoptionPeople: ManagerAdoptionPersonView[];
}

/**
 * Owns the small piece of client-side coordination the composer + its two
 * list sections need to share ("🕒 התראות מתוזמנות" editing hands its item
 * back up to the composer; any successful action anywhere here should
 * refresh both lists) -- `ManagerBroadcastComposer` itself stays usable on
 * its own (see its own test file), this is purely a thin wiring layer on
 * top of it.
 */
export function ManagerBroadcastArea({ roster, adoptionPeople }: ManagerBroadcastAreaProps) {
  const [editingItem, setEditingItem] = useState<ScheduledBroadcastView | null>(null);
  const [scheduledReloadToken, setScheduledReloadToken] = useState(0);
  const [recentReloadToken, setRecentReloadToken] = useState(0);
  const [hasActiveScheduledBroadcasts, setHasActiveScheduledBroadcasts] = useState(false);

  function refreshBoth() {
    setScheduledReloadToken((token) => token + 1);
    setRecentReloadToken((token) => token + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <ManagerBroadcastComposer
        key={editingItem?.id ?? "new"}
        roster={roster}
        adoptionPeople={adoptionPeople}
        editingItem={editingItem}
        onSaved={refreshBoth}
        onCancelEdit={() => setEditingItem(null)}
      />
      <ManagerScheduledBroadcastsSection
        reloadToken={scheduledReloadToken}
        editingId={editingItem?.id ?? null}
        onEdit={setEditingItem}
        onChanged={refreshBoth}
        onActiveChange={setHasActiveScheduledBroadcasts}
      />
      <ManagerRecentBroadcastsSection reloadToken={recentReloadToken} pollWhileActive={hasActiveScheduledBroadcasts} />
      <ManagerFixedNotificationsSection roster={roster} adoptionPeople={adoptionPeople} />
    </div>
  );
}
