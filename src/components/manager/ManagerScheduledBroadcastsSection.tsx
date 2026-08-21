"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import {
  cancelScheduledBroadcastAction,
  listActiveScheduledBroadcastsAction,
  sendScheduledBroadcastNowAction,
  type ScheduledBroadcastView,
} from "@/lib/notifications/scheduledBroadcastActions";
import { formatScheduledBroadcastMoment } from "@/lib/presentation/scheduledBroadcast";

interface ManagerScheduledBroadcastsSectionProps {
  /** Bumped by the parent whenever a create/edit/cancel/send-now elsewhere should be reflected here. */
  reloadToken: number;
  onEdit: (item: ScheduledBroadcastView) => void;
  /** Fired after a successful send-now/cancel -- the parent also refreshes "נשלחו לאחרונה" on send-now. */
  onChanged: () => void;
  editingId: string | null;
}

function audienceLabel(item: ScheduledBroadcastView): string {
  if (item.audienceKind === "everyone") return "כולם";
  if (item.audienceKind === "person") return "אדם אחד";
  return `${item.targetPersonIds.length} אנשי צוות`;
}

const STATUS_LABELS: Record<ScheduledBroadcastView["status"], string> = {
  scheduled: "ממתין לשליחה",
  claimed: "בשליחה כעת…",
  dispatched: "נשלח",
  cancelled: "בוטל",
};

const ERROR_LABELS: Record<string, string> = {
  not_found: "התזמון לא נמצא -- ייתכן שכבר בוטל.",
  already_started: "השליחה כבר התחילה, ולא ניתן עוד לפעול על התזמון הזה.",
  already_cancelled: "התזמון הזה כבר בוטל.",
  forbidden: "רק מנהל/ת יכול/ה לפעול על תזמון.",
};

function errorLabel(error: string): string {
  return ERROR_LABELS[error] ?? "הפעולה נכשלה. נסה/י שוב.";
}

/**
 * "🕒 התראות מתוזמנות" -- every not-yet-dispatched scheduled broadcast
 * (including one currently `'claimed'` mid-dispatch, a normally brief
 * transient state where actions are disabled). "עריכה" hands the item up
 * to the composer (`ManagerBroadcastArea`); "שלח עכשיו"/"ביטול" call their
 * own server actions directly and refresh this list (and, for "שלח עכשיו",
 * the "נשלחו לאחרונה" list) via `onChanged`.
 */
export function ManagerScheduledBroadcastsSection({
  reloadToken,
  onEdit,
  onChanged,
  editingId,
}: ManagerScheduledBroadcastsSectionProps) {
  const [items, setItems] = useState<ScheduledBroadcastView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await listActiveScheduledBroadcastsAction();
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

  async function handleSendNow(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      const outcome = await sendScheduledBroadcastNowAction(id);
      if (outcome.ok) onChanged();
      else setActionError({ id, message: errorLabel(outcome.error) });
    } catch {
      setActionError({ id, message: errorLabel("unknown") });
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmCancel(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      const outcome = await cancelScheduledBroadcastAction(id);
      if (outcome.ok) onChanged();
      else setActionError({ id, message: errorLabel(outcome.error) });
    } catch {
      setActionError({ id, message: errorLabel("unknown") });
    } finally {
      setBusyId(null);
      setConfirmingCancelId(null);
    }
  }

  if (loadError) {
    return (
      <Panel variant="compact" data-testid="manager-scheduled-broadcasts">
        <p className="text-sm text-muted">לא ניתן לטעון את ההתראות המתוזמנות כרגע.</p>
      </Panel>
    );
  }

  if (items === null) return null;
  if (items.length === 0) return null;

  return (
    <Panel variant="compact" data-testid="manager-scheduled-broadcasts">
      <h4 className="text-sm font-semibold text-foreground">🕒 התראות מתוזמנות</h4>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => {
          const editable = item.status === "scheduled";
          const isBusy = busyId === item.id;
          const isEditing = editingId === item.id;
          const moment = formatScheduledBroadcastMoment(item.scheduledLocalDate, item.scheduledLocalMinuteOfDay);

          return (
            <li key={item.id} className={`rounded-lg p-2.5 ring-1 ring-border ${isEditing ? "bg-primary/5" : "bg-overlay-faint"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{item.title}</p>
                <Badge tone={item.status === "claimed" ? "warning" : "neutral"}>{STATUS_LABELS[item.status]}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {moment ?? item.scheduledFor} · {audienceLabel(item)}
                {item.createdByPersonName ? ` · נוצר ע״י ${item.createdByPersonName}` : ""}
              </p>

              {editable ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onEdit(item)}
                    className="rounded-full bg-overlay-soft px-3 py-1 text-xs font-medium text-foreground ring-1 ring-border hover:bg-overlay-strong disabled:opacity-50"
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleSendNow(item.id)}
                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/25 hover:bg-primary/20 disabled:opacity-50"
                  >
                    {isBusy ? "שולח/ת…" : "שלח עכשיו"}
                  </button>
                  {confirmingCancelId === item.id ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted">לבטל את התזמון?</span>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleConfirmCancel(item.id)}
                        className="rounded-full bg-critical/10 px-2.5 py-1 font-medium text-critical ring-1 ring-critical/25 hover:bg-critical/20 disabled:opacity-50"
                      >
                        כן, בטל
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingCancelId(null)}
                        className="rounded-full px-2.5 py-1 font-medium text-muted underline"
                      >
                        לא
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setConfirmingCancelId(item.id)}
                      className="rounded-full bg-critical/10 px-3 py-1 text-xs font-medium text-critical ring-1 ring-critical/25 hover:bg-critical/20 disabled:opacity-50"
                    >
                      ביטול
                    </button>
                  )}
                </div>
              ) : null}

              {actionError?.id === item.id ? (
                <p className="mt-1.5 text-xs text-critical">{actionError.message}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
