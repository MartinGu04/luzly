import "server-only";
import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { resolveSafeNotificationPath } from "@/lib/push/notificationPath";
import {
  NOTIFICATION_INBOX_LIMIT,
  getInboxClearedBefore,
  getInboxJobsForRecipient,
  getReadJobIds,
} from "@/lib/notifications/engine/store";
import type { NotificationInboxItem, NotificationInboxReadModel } from "./notificationInboxTypes";

const EMPTY_INBOX: NotificationInboxReadModel = { items: [], unreadCount: 0 };

/**
 * Server-only orchestration for the notification center's inbox --
 * reuses the SAME durable `notification_jobs` outbox `recentDashboardChanges.ts`
 * (PR #36's "מה השתנה" recap) already reads from, never a second
 * notification-rule engine. Unlike that recap, this is the FULL personal
 * inbox: every category the engine creates (see
 * `lib/notifications/engine/store.ts`'s `getInboxJobsForRecipient` for
 * the exact `scheduled_for`-based visibility window), not a 3-category/
 * 3-item horizon.
 *
 * Resolves the authenticated user independently (same "re-verify, don't
 * thread an already-narrowed read model across boundaries" pattern every
 * other server-only loader in this codebase uses) and queries ONLY that
 * user's own rows -- never a client-supplied recipient id, and never
 * through anything but the notification engine's own service-role-gated
 * store layer: RLS on `notification_jobs`/`notification_reads`/
 * `notification_inbox_state` is default-deny with zero policies, so
 * there is no other way for a browser-authenticated request to read any
 * of this at all.
 *
 * Read state is joined in the SAME request (`getReadJobIds`, one `.in()`
 * query regardless of how many items are visible -- never N+1), so
 * `unreadCount` and `items[].isRead` can never disagree with each other.
 *
 * Never throws: an infra/config failure here must never take down the
 * app shell the bell lives in, which stays more important than this
 * optional inbox -- caught and logged (a fixed, PII-safe string, matching
 * the notification worker's own `console.error` convention), degrading
 * to an empty inbox.
 */
export async function loadNotificationInbox(): Promise<NotificationInboxReadModel> {
  try {
    const identity = await getAuthenticatedIdentity();
    if (identity.status !== "authenticated") return EMPTY_INBOX;

    const clearedBefore = await getInboxClearedBefore(identity.userId);
    const jobs = await getInboxJobsForRecipient(identity.userId, clearedBefore, NOTIFICATION_INBOX_LIMIT);
    const readIds = await getReadJobIds(
      identity.userId,
      jobs.map((job) => job.id),
    );

    const items: NotificationInboxItem[] = jobs.map((job) => ({
      id: job.id,
      category: job.category,
      title: job.title,
      body: job.body,
      // `notification_jobs.path` is hardcoded at job-creation time today
      // (`copy.ts`/`reminders.ts`), but this is the server/client
      // boundary -- the exact point `buildNotificationPayload` already
      // treats push paths the same way at (`resolveSafeNotificationPath`,
      // reused here rather than trusted as persisted-therefore-safe
      // forever). A malformed/unexpected future value degrades to "/",
      // never an external or protocol-relative destination.
      path: resolveSafeNotificationPath(job.path),
      happenedAt: job.scheduledFor,
      isRead: readIds.has(job.id),
    }));

    return { items, unreadCount: items.filter((item) => !item.isRead).length };
  } catch {
    console.error("[notifications] inbox query failed");
    return EMPTY_INBOX;
  }
}
