"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_REVALIDATE_EVENT } from "@/components/layout/AppRevalidator";
import type { NotificationInboxItem } from "@/lib/readModels/notificationInboxTypes";
import {
  clearNotificationInboxAction,
  getNotificationInboxAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/notifications/inboxActions";

export type NotificationInboxStatus = "loading" | "ready" | "error";

/**
 * All notification CENTER state/actions (as opposed to
 * `usePushSubscription`, which owns push-DELIVERY-channel state only --
 * the two are deliberately separate hooks, since push is one delivery
 * channel among possibly none, never a precondition for the inbox
 * existing). Backs `NotificationBell`'s inbox view.
 *
 * `unreadCount` is always derived from `items` (`useMemo`, never a
 * second piece of state) -- it can never disagree with what the list
 * itself shows, by construction.
 *
 * Every mutation (`markRead`/`markAllRead`/`clear`) updates local state
 * OPTIMISTICALLY for a snappy popover, then re-syncs from the server on
 * failure only -- same "re-derive the truthful state, never assume
 * success" philosophy `usePushSubscription`'s `disable()` already
 * established, just optimistic-first here since a stale unread flag is
 * low-stakes (unlike push enable/disable, where silently claiming
 * success would be actively misleading).
 */
export function useNotificationInbox() {
  const [status, setStatus] = useState<NotificationInboxStatus>("loading");
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // `.then()/.catch()` rather than async/await + try/catch here on purpose
  // -- this exact function is called directly from the mount effect below,
  // and the react-compiler-based lint's effect analysis cannot see past a
  // try/catch to confirm the contained setState calls are safely gated,
  // flagging a false positive it doesn't raise for this same chained-promise
  // shape.
  const refresh = useCallback(() => {
    return getNotificationInboxAction()
      .then((result) => {
        if (!mountedRef.current) return;
        setItems(result.items);
        setStatus("ready");
      })
      .catch(() => {
        if (mountedRef.current) setStatus("error");
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keeps the badge fresh while the app shell stays mounted, without the
  // user ever opening the bell -- `AppRevalidator` is already mounted
  // once for the whole authenticated shell and already re-checks
  // freshness on tab-resume/BFCache-restore/a slow periodic cadence
  // while visible (see its own docstring); this listens for the SAME
  // event rather than running a second timer or visibility listener of
  // its own. No polling loop and no realtime channel are added here --
  // this only reacts to a signal that already exists.
  useEffect(() => {
    function handleAppRevalidate() {
      refresh();
    }
    window.addEventListener(APP_REVALIDATE_EVENT, handleAppRevalidate);
    return () => {
      window.removeEventListener(APP_REVALIDATE_EVENT, handleAppRevalidate);
    };
  }, [refresh]);

  const unreadCount = useMemo(() => items.filter((item) => !item.isRead).length, [items]);

  const markRead = useCallback(
    async (jobId: string) => {
      setItems((prev) => prev.map((item) => (item.id === jobId ? { ...item, isRead: true } : item)));
      const result = await markNotificationReadAction(jobId);
      if (!result.ok && mountedRef.current) await refresh();
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    const result = await markAllNotificationsReadAction();
    if (!result.ok && mountedRef.current) await refresh();
  }, [refresh]);

  const clear = useCallback(async () => {
    setItems([]);
    const result = await clearNotificationInboxAction();
    if (!result.ok && mountedRef.current) await refresh();
  }, [refresh]);

  return { status, items, unreadCount, refresh, markRead, markAllRead, clear };
}
