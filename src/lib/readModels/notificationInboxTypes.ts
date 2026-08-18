/**
 * One notification center item -- a thin, safe projection of a single
 * `notification_jobs` row plus this user's own read state (see
 * `notificationInbox.ts`). `title`/`body` are the SAME already-Hebrew,
 * already-emoji-prefixed copy the real push notification for this event
 * would have shown (`lib/notifications/engine/copy.ts`/`reminders.ts`) --
 * reused verbatim, never regenerated, so the inbox never says anything
 * different from what a push-enabled user already saw. `path` is the
 * SAME hardcoded, already-safe in-app destination stored on the job at
 * creation time -- never recomputed, never a raw/arbitrary route.
 * Deliberately never carries `recipientUserId`, `dedupeKey`, `sourceRef`,
 * `attempts`, `status`, `claimedAt`, or any other internal
 * notification-engine field.
 */
export interface NotificationInboxItem {
  id: string;
  category: string;
  title: string;
  body: string;
  path: string;
  /** The job's own `scheduled_for` -- the instant this notification was actually MEANT to happen (not when the worker first computed it; see `getInboxJobsForRecipient`'s own docstring). Relative-time display only, never a raw timestamp. */
  happenedAt: string;
  isRead: boolean;
}

export interface NotificationInboxReadModel {
  items: NotificationInboxItem[];
  unreadCount: number;
}
