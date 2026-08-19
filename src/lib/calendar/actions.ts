"use server";

import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import {
  disableCalendarFeedForCurrentUser,
  enableCalendarFeedForCurrentUser,
  resetCalendarFeedForCurrentUser,
} from "./feedStore";
import { buildCalendarFeedLinks, type CalendarFeedLinks } from "./feedUrl";
import { resolveRequestOrigin } from "./requestOrigin";

export type CalendarSyncActionResult = { ok: true; links: CalendarFeedLinks } | { ok: false; error: string };

/**
 * Enables calendar sync for the authenticated user -- creates a feed row
 * only if one doesn't already exist (see `enableCalendarFeedForCurrentUser`'s
 * own idempotency docs), then returns the ready-to-use links so the
 * client component can render "Copy Link"/"Add to Google/Apple Calendar"
 * immediately, without a full page reload.
 */
export async function enableCalendarSyncAction(): Promise<CalendarSyncActionResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false, error: "not_authenticated" };

  const origin = await resolveRequestOrigin();
  if (!origin) return { ok: false, error: "unknown_origin" };

  const result = await enableCalendarFeedForCurrentUser(identity.userId);
  if (!result.ok) return { ok: false, error: "persist_failed" };

  return { ok: true, links: buildCalendarFeedLinks(origin, result.token) };
}

/**
 * Rotates the authenticated user's feed token -- the previous URL stops
 * working the instant this commits (see `resetCalendarFeedForCurrentUser`).
 * Only meaningful when sync is already enabled; the UI only offers this
 * action in that state.
 */
export async function resetCalendarSyncAction(): Promise<CalendarSyncActionResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false, error: "not_authenticated" };

  const origin = await resolveRequestOrigin();
  if (!origin) return { ok: false, error: "unknown_origin" };

  const result = await resetCalendarFeedForCurrentUser(identity.userId);
  if (!result.ok) return { ok: false, error: result.reason };

  return { ok: true, links: buildCalendarFeedLinks(origin, result.token) };
}

export interface DisableCalendarSyncResult {
  ok: boolean;
}

/** Revokes the authenticated user's feed entirely -- see `disableCalendarFeedForCurrentUser`. */
export async function disableCalendarSyncAction(): Promise<DisableCalendarSyncResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false };
  return disableCalendarFeedForCurrentUser(identity.userId);
}
