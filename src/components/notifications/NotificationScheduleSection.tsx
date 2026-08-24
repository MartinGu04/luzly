"use client";

import { useState } from "react";
import { ManagerBroadcastComposer } from "@/components/manager/ManagerBroadcastComposer";
import { ManagerScheduledBroadcastsSection } from "@/components/manager/ManagerScheduledBroadcastsSection";
import type { ScheduledBroadcastView } from "@/lib/notifications/scheduledBroadcastActions";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";

interface NotificationScheduleSectionProps {
  roster: ManagerPersonSummary[];
  adoptionPeople: ManagerAdoptionPersonView[];
}

/**
 * "תזמון" -- the standalone Notification Center's own scheduling
 * coordinator: the SAME existing composer (fixed to `mode="schedule"`) plus
 * the existing "🕒 התראות מתוזמנות" list, wired together exactly like the
 * old `ManagerBroadcastArea` used to wire them ("עריכה" hands the item back
 * up to the composer; any successful create/edit/cancel/send-now refreshes
 * the list) -- narrowed to just the two pieces THIS section owns, now that
 * "עכשיו"/"היסטוריה"/"קבועות" each live on their own URL section instead of
 * one combined screen.
 */
export function NotificationScheduleSection({ roster, adoptionPeople }: NotificationScheduleSectionProps) {
  const [editingItem, setEditingItem] = useState<ScheduledBroadcastView | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  function refresh() {
    setReloadToken((token) => token + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <ManagerBroadcastComposer
        key={editingItem?.id ?? "new"}
        mode="schedule"
        roster={roster}
        adoptionPeople={adoptionPeople}
        editingItem={editingItem}
        onSaved={refresh}
        onCancelEdit={() => setEditingItem(null)}
      />
      <ManagerScheduledBroadcastsSection
        reloadToken={reloadToken}
        editingId={editingItem?.id ?? null}
        onEdit={setEditingItem}
        onChanged={refresh}
      />
    </div>
  );
}
