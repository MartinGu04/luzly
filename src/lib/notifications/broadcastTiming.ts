/**
 * Manager broadcast delivery timing -- pure, directive-free (no
 * `"server-only"`/`"use server"`) so BOTH the read-model action
 * (`manualBroadcastActions.ts`, computing `deliveryLatencySeconds`) and the
 * client "נשלחו לאחרונה" timing row (`ManagerRecentBroadcastsSection.tsx`,
 * formatting clock times/durations for display) import ONE shared source of
 * truth instead of two implementations that could drift -- same reasoning
 * as `manualBroadcastLimits.ts`.
 *
 * This module never reads/writes anything itself; it only turns already-
 * fetched timestamps (see `engine/store.ts`'s `getManagerBroadcastDeliveryTiming`)
 * into the "how long did delivery actually take" number, and that number
 * (plus a raw instant) into Hebrew display text.
 */

export interface DeliveryLatencyInput {
  /** `manager_notification_batches.created_at` -- the immediate-broadcast reference instant. */
  batchCreatedAt: string;
  /** `manager_scheduled_broadcasts.scheduled_for` for a scheduled broadcast; null for an immediate one. */
  scheduledFor: string | null;
  /** `manager_scheduled_broadcasts.sent_now_at` -- non-null only when "שלח עכשיו" triggered dispatch early. */
  sentNowAt: string | null;
  /** Earliest successful Web Push delivery instant, or null when nothing has succeeded yet, or ever. */
  firstSuccessfulPushAt: string | null;
}

/**
 * The correct "how long did the system take to actually start sending
 * after it was supposed/requested to send" reference instant:
 * - immediate manual broadcast (`scheduledFor === null`) -> the batch's own
 *   `created_at`.
 * - a scheduled broadcast manually triggered via "שלח עכשיו" (`sentNowAt`
 *   non-null) -> `sentNowAt`, NEVER the original (possibly still-future)
 *   `scheduledFor` -- otherwise a manager forcing an early send would show a
 *   nonsensical/negative latency measured against a time that hasn't
 *   happened yet.
 * - a normal scheduled dispatch -> `scheduledFor` itself.
 */
export function deliveryLatencyReferenceInstant(
  input: Pick<DeliveryLatencyInput, "batchCreatedAt" | "scheduledFor" | "sentNowAt">,
): string {
  if (input.scheduledFor === null) return input.batchCreatedAt;
  return input.sentNowAt ?? input.scheduledFor;
}

/**
 * `firstSuccessfulPushAt` minus the correct reference instant above, in
 * seconds -- null whenever `firstSuccessfulPushAt` itself is null (no false
 * data: this function never invents a duration for a broadcast that hasn't
 * successfully delivered). Clamped to a non-negative value defensively
 * (clock skew across services should never render as a negative duration).
 */
export function computeDeliveryLatencySeconds(input: DeliveryLatencyInput): number | null {
  if (input.firstSuccessfulPushAt === null) return null;
  const referenceMs = Date.parse(deliveryLatencyReferenceInstant(input));
  const sentMs = Date.parse(input.firstSuccessfulPushAt);
  if (Number.isNaN(referenceMs) || Number.isNaN(sentMs)) return null;
  return Math.max(0, (sentMs - referenceMs) / 1000);
}

const JERUSALEM_CLOCK_FORMATTER = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jerusalem",
});

/** `HH:MM` in Asia/Jerusalem, explicitly -- never the browser/device's own timezone. Fails safe (`--:--`) on a malformed instant rather than throwing. */
export function formatJerusalemClockTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "--:--";
  return JERUSALEM_CLOCK_FORMATTER.format(new Date(ms));
}

/** Compact Hebrew duration -- `"2 שנ׳"` under a minute, `"1 דק׳ 12 שנ׳"` at or above it. Never shows milliseconds; rounds to the nearest whole second first so the minute/second split can never show a stray "60 שנ׳" remainder. */
export function formatDeliveryDurationSeconds(totalSeconds: number): string {
  const roundedTotal = Math.max(0, Math.round(totalSeconds));
  if (roundedTotal < 60) return `${roundedTotal} שנ׳`;
  const minutes = Math.floor(roundedTotal / 60);
  const seconds = roundedTotal % 60;
  return `${minutes} דק׳ ${seconds} שנ׳`;
}
