"use server";

import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { loadNotificationInbox } from "@/lib/readModels/notificationInbox";
import type { NotificationInboxReadModel } from "@/lib/readModels/notificationInboxTypes";
import {
  NOTIFICATION_INBOX_LIMIT,
  clearNotificationInbox,
  getInboxClearedBefore,
  getInboxJobsForRecipient,
  getReadJobIds,
  markNotificationJobRead,
  markNotificationJobsRead,
} from "@/lib/notifications/engine/store";

/**
 * The notification center's read boundary -- a thin wrapper so
 * `useNotificationInbox` (the client hook) can (re)fetch the SAME
 * `loadNotificationInbox()` read model any Server Component would, from
 * a "use client" bell that mounts outside any page's own server render
 * (same convention `getPushSubscriptionStatusAction` already
 * established for this exact component tree).
 */
export async function getNotificationInboxAction(): Promise<NotificationInboxReadModel> {
  return loadNotificationInbox();
}

export type InboxActionResult = { ok: true } | { ok: false; error: string };

/**
 * Marks ONE job read for the authenticated caller. `jobId` is
 * client-supplied (the item the user clicked) but the write is ALWAYS
 * scoped to the server-verified `identity.userId` -- never a
 * client-supplied user id -- so this can only ever create a read-state
 * row under the CALLER's own account. A `jobId` that doesn't belong to
 * the caller (or doesn't exist) is harmless: `notification_reads` has no
 * content of its own, and `markNotificationJobRead` never reads back or
 * exposes the job it points at.
 */
export async function markNotificationReadAction(jobId: string): Promise<InboxActionResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false, error: "not_authenticated" };
  if (typeof jobId !== "string" || jobId.length === 0) return { ok: false, error: "invalid_job_id" };

  try {
    await markNotificationJobRead(identity.userId, jobId);
    return { ok: true };
  } catch {
    return { ok: false, error: "mark_read_failed" };
  }
}

/**
 * "סמן הכל כנקרא" -- marks every currently-unread, currently-visible
 * item read in ONE bulk upsert. Deliberately re-derives "currently
 * unread" server-side (same `clearedBefore`/`scheduled_for` visibility
 * window `loadNotificationInbox` uses) rather than trusting a
 * client-supplied id list -- the client never gets to decide what counts
 * as "all".
 */
export async function markAllNotificationsReadAction(): Promise<InboxActionResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false, error: "not_authenticated" };

  try {
    const clearedBefore = await getInboxClearedBefore(identity.userId);
    const jobs = await getInboxJobsForRecipient(identity.userId, clearedBefore, NOTIFICATION_INBOX_LIMIT);
    const readIds = await getReadJobIds(
      identity.userId,
      jobs.map((job) => job.id),
    );
    const unreadIds = jobs.map((job) => job.id).filter((id) => !readIds.has(id));
    await markNotificationJobsRead(identity.userId, unreadIds);
    return { ok: true };
  } catch {
    return { ok: false, error: "mark_all_read_failed" };
  }
}

/**
 * "נקה התראות" -- advances the caller's own inbox cutoff. Never deletes
 * or updates a single `notification_jobs` row (see
 * `clearNotificationInbox`'s own docstring) -- the technical outbox
 * history stays fully intact for the worker/any future audit; only this
 * user's OWN view of it changes.
 */
export async function clearNotificationInboxAction(): Promise<InboxActionResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false, error: "not_authenticated" };

  try {
    await clearNotificationInbox(identity.userId);
    return { ok: true };
  } catch {
    return { ok: false, error: "clear_failed" };
  }
}
