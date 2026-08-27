"use server";

import { after } from "next/server";
import { isAudienceGroupKey, type AudienceGroupKey } from "@/lib/domain/audienceGroups";
import { loadManagerPersonnelContext, loadManagerWorkbookContext } from "@/lib/readModels/managerWorkbookContext";
import { computeDeliveryLatencySeconds } from "./broadcastTiming";
import { runDelivery } from "./engine/delivery";
import {
  sendManagerBroadcastNotification,
  type BroadcastAudienceKind,
  type BroadcastUnresolvedPerson,
} from "./engine/manualBroadcast";
import {
  getManagerBroadcastDeliveryTiming,
  listRecentManagerNotificationBatches,
  RECENT_MANAGER_BROADCASTS_LIMIT,
  type ManagerBroadcastDeliveryTiming,
} from "./engine/store";
import { formatWorkerErrorLog, runStage, sanitizeWorkerError, WorkerStageError } from "./engine/workerErrors";

const MAX_TARGET_IDS = 5000; // generously above any realistic roster size -- a defensive upper bound, not a real limit.
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

export interface SendManagerBroadcastActionInput {
  audienceKind: BroadcastAudienceKind;
  /** Untrusted candidate roster ids -- re-validated against the freshly-fetched roster before anything is sent (see `sendManagerBroadcastNotification`). Ignored unless `audienceKind` is `"person"`/`"people"`. */
  targetPersonIds: string[];
  /** Untrusted candidate group keys -- re-validated against the canonical `AudienceGroupKey` enum before anything is sent. Ignored unless `audienceKind === "groups"`. */
  groupKeys?: string[];
  /** "לא לשלוח ל" -- untrusted candidate roster ids, ALWAYS re-validated against the freshly-fetched roster, independent of `audienceKind`. */
  excludedPersonIds?: string[];
  title: string;
  body: string;
  /** Generated once per compose session on the client (e.g. `crypto.randomUUID()`), unchanged across a retry -- the batch-level idempotency key. */
  idempotencyKey: string;
}

export type SendManagerBroadcastActionResult =
  | {
      ok: true;
      batchId: string;
      resolvedRecipientCount: number;
      pushCapableCount: number;
      inboxOnlyCount: number;
      unresolvedCount: number;
      unresolved: BroadcastUnresolvedPerson[];
    }
  | { ok: false; error: string };

function isValidRequestShape(input: SendManagerBroadcastActionInput): boolean {
  if (
    input.audienceKind !== "person" &&
    input.audienceKind !== "people" &&
    input.audienceKind !== "everyone" &&
    input.audienceKind !== "groups"
  ) {
    return false;
  }
  if (!Array.isArray(input.targetPersonIds) || input.targetPersonIds.length > MAX_TARGET_IDS) return false;
  if (!input.targetPersonIds.every((id) => typeof id === "string")) return false;
  const groupKeys = input.groupKeys ?? [];
  if (!Array.isArray(groupKeys) || groupKeys.length > MAX_TARGET_IDS) return false;
  if (!groupKeys.every(isAudienceGroupKey)) return false;
  const excludedPersonIds = input.excludedPersonIds ?? [];
  if (!Array.isArray(excludedPersonIds) || excludedPersonIds.length > MAX_TARGET_IDS) return false;
  if (!excludedPersonIds.every((id) => typeof id === "string")) return false;
  if (typeof input.title !== "string" || typeof input.body !== "string") return false;
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 8) return false;
  if (input.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) return false;
  return true;
}

/**
 * Manager Area's "שליחת התראה" composer -- the ONE privileged write
 * boundary for a manual broadcast notification. This action itself never
 * touches Supabase directly (no service-role reference here at all -- see
 * `notificationServiceRoleBoundary.test.ts`); it only authenticates,
 * authorizes, and delegates.
 *
 * Security sequence, all independently re-derived server-side, never
 * trusting anything the client sent beyond raw shape:
 * 1. `loadManagerWorkbookContext(["personnel"])` -- the SAME shared
 *    boundary every other manager-only feature uses: authenticates the
 *    caller, fails closed on any non-"ok" identity state, and only THEN
 *    fetches the roster -- never for a non-manager.
 * 2. Re-verifies `isManager === true` against a FRESHLY re-parsed
 *    personnel sheet (built into `loadManagerWorkbookContext` itself,
 *    defense in depth against a stale/cached first check).
 * 3. `targetPersonIds` is treated as untrusted candidates only --
 *    `sendManagerBroadcastNotification` filters them down to genuine
 *    members of the freshly-fetched roster before resolving anyone to a
 *    real Supabase auth user id. A client can never redirect a
 *    notification to an id outside the manager's own roster, and never
 *    supply an auth user id, email, or readiness status directly.
 *
 * Once (and only once) `sendManagerBroadcastNotification` reports a durable
 * success, this registers an `after()` callback (`next/server`) that kicks
 * the existing `runDelivery()` pipeline in the background -- this is what
 * makes a manual "Send Now" broadcast deliver within seconds instead of
 * waiting for the next Cron-driven worker tick (see `scheduledWorker.ts`'s
 * docstring for the Cron-driven fallback path this still falls back to).
 * The manager never waits for it: `after()` runs after the response is
 * already on the wire, and a failure there is caught and logged (never
 * thrown) so it can never flip an already-successful result to `ok: false`.
 */
export async function sendManagerBroadcastAction(
  input: SendManagerBroadcastActionInput,
): Promise<SendManagerBroadcastActionResult> {
  if (!isValidRequestShape(input)) return { ok: false, error: "invalid_request" };

  const contextResult = await loadManagerWorkbookContext(["personnel"]);
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const { manager, people } = contextResult.context;

  const outcome = await sendManagerBroadcastNotification({
    manager,
    people,
    audienceKind: input.audienceKind,
    targetPersonIds: input.targetPersonIds,
    groupKeys: (input.groupKeys ?? []) as AudienceGroupKey[],
    excludedPersonIds: input.excludedPersonIds ?? [],
    title: input.title,
    body: input.body,
    idempotencyKey: input.idempotencyKey,
  });

  if (!outcome.ok) return { ok: false, error: outcome.error };

  // The batch/jobs are now durably created (see `sendManagerBroadcastNotification`
  // above) -- only THEN do we kick delivery, never before. `after()` runs this
  // once the response has been sent, so the manager never waits for the full
  // push-delivery loop; a real Cron-driven worker (the once-a-minute
  // scheduled-broadcast worker, then the 5-minute main worker) remains the
  // fallback if this best-effort kick never runs or fails (see
  // `scheduledWorker.ts`'s own docstring). `runDelivery()` is the SAME single
  // delivery implementation every worker uses -- never a second push sender --
  // and is safe to invoke redundantly: `claim_due_notification_jobs` claims
  // atomically and each device's delivery row has a terminal state, so an
  // idempotent retry of this action that schedules another kick is harmless.
  after(async () => {
    try {
      await runStage("manual_broadcast_immediate_delivery", () => runDelivery());
    } catch (error) {
      // A failure here must never turn an already-durable successful
      // broadcast into a failure the manager sees -- the response was already
      // sent. Only the recovery workers' cadence is affected; this is
      // reported the same PII-safe way every other worker stage failure is.
      const stage = error instanceof WorkerStageError ? error.stage : "unknown";
      const cause = error instanceof WorkerStageError ? error.cause : error;
      console.error(formatWorkerErrorLog(stage, sanitizeWorkerError(cause)));
    }
  });

  return {
    ok: true,
    batchId: outcome.result.batchId,
    resolvedRecipientCount: outcome.result.resolvedRecipientCount,
    pushCapableCount: outcome.result.pushCapableCount,
    inboxOnlyCount: outcome.result.inboxOnlyCount,
    unresolvedCount: outcome.result.unresolvedCount,
    unresolved: outcome.result.unresolved,
  };
}

export interface RecentManagerBroadcastView {
  id: string;
  title: string;
  body: string;
  audienceKind: BroadcastAudienceKind;
  createdByPersonName: string;
  /** The batch's own creation/dispatch instant -- UNCHANGED semantics for both immediate and scheduled broadcasts. This stays the list's sort/clear-cutoff anchor (see `ManagerRecentBroadcastsSection.tsx`'s own "נקה מהתצוגה" logic); never swapped for a scheduled broadcast's original schedule-creation time, which would make a broadcast scheduled long ago (but dispatched just now) sort/clear as if it were already stale. See `scheduleCreatedAt` below for that displayed value instead. */
  createdAt: string;
  resolvedRecipientCount: number;
  pushCapableCount: number;
  inboxOnlyCount: number;
  unresolvedCount: number;
  /** The matched `manager_scheduled_broadcasts` row's own `created_at` -- the "נוצר" instant the UI displays for a SCHEDULED broadcast (when the manager originally created/last edited the schedule). Null for an immediate broadcast, whose displayed "נוצר" is simply `createdAt` itself. */
  scheduleCreatedAt: string | null;
  /** The scheduled row's own `scheduled_for` -- null for an immediate broadcast. */
  scheduledFor: string | null;
  /** Non-null only when the scheduled broadcast was triggered early via "שלח עכשיו". */
  sentNowAt: string | null;
  /** Earliest successful Web Push delivery instant across every recipient/device of this batch -- a successful PUSH REQUEST, never proof of on-device receipt. Null when nothing has succeeded yet, or ever -- never substituted with `createdAt` or any other guess. */
  firstSuccessfulPushAt: string | null;
  /** `firstSuccessfulPushAt` minus the correct reference instant (see `computeDeliveryLatencySeconds`) -- null whenever `firstSuccessfulPushAt` is null. */
  deliveryLatencySeconds: number | null;
  /** A small truthful fallback for when `firstSuccessfulPushAt` is null -- see `ManagerBroadcastDeliveryTiming`'s own docstring in `engine/store.ts`. */
  deliveryState: ManagerBroadcastDeliveryTiming["deliveryState"];
}

export type GetRecentManagerBroadcastsResult =
  | { ok: true; items: RecentManagerBroadcastView[] }
  | { ok: false; error: string };

/**
 * A small, bounded "recent sends" list for the composer -- reuses
 * `manager_notification_batches`'s own audit columns, never a second
 * history mechanism. Polled every ~17s alongside the scheduled-broadcast
 * list (spec §7), so this uses the same LIGHTWEIGHT
 * `loadManagerPersonnelContext` boundary as `listActiveScheduledBroadcastsAction`
 * -- personnel-only, cached workbook read -- rather than
 * `loadManagerWorkbookContext`'s full Personal Schedule read-model gate.
 * Still manager-gated exactly like the send action itself.
 *
 * Extended (still ONE bounded read, never a second history/archive
 * endpoint) with truthful delivery timing per batch: `getManagerBroadcastDeliveryTiming`
 * bulk-aggregates `manager_scheduled_broadcasts`/`notification_jobs`/
 * `notification_deliveries` for these <=10 batch ids in three queries
 * total, then `computeDeliveryLatencySeconds` (a pure function, shared with
 * the UI's own formatting -- see `broadcastTiming.ts`) turns that into the
 * one duration number the UI displays. Never fakes a "sent" time from
 * `createdAt` -- a batch with no successful delivery yet gets
 * `firstSuccessfulPushAt: null` / `deliveryLatencySeconds: null` and a
 * truthful `deliveryState` instead (see that field's own docstring).
 */
export async function getRecentManagerBroadcastsAction(): Promise<GetRecentManagerBroadcastsResult> {
  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const rows = await listRecentManagerNotificationBatches(RECENT_MANAGER_BROADCASTS_LIMIT);
  const timingByBatchId = await getManagerBroadcastDeliveryTiming(rows);

  return {
    ok: true,
    items: rows.map((row) => {
      const timing: ManagerBroadcastDeliveryTiming = timingByBatchId.get(row.id) ?? {
        scheduleCreatedAt: null,
        scheduledFor: null,
        sentNowAt: null,
        firstSuccessfulPushAt: null,
        deliveryState: row.pushCapableCount === 0 ? "no_push_recipients" : "pending",
      };
      const deliveryLatencySeconds = computeDeliveryLatencySeconds({
        batchCreatedAt: row.createdAt,
        scheduledFor: timing.scheduledFor,
        sentNowAt: timing.sentNowAt,
        firstSuccessfulPushAt: timing.firstSuccessfulPushAt,
      });

      return {
        id: row.id,
        title: row.title,
        body: row.body,
        audienceKind: row.audienceKind,
        createdByPersonName: row.createdByPersonName,
        createdAt: row.createdAt,
        resolvedRecipientCount: row.resolvedRecipientCount,
        pushCapableCount: row.pushCapableCount,
        inboxOnlyCount: row.inboxOnlyCount,
        unresolvedCount: row.unresolvedCount,
        scheduleCreatedAt: timing.scheduleCreatedAt,
        scheduledFor: timing.scheduledFor,
        sentNowAt: timing.sentNowAt,
        firstSuccessfulPushAt: timing.firstSuccessfulPushAt,
        deliveryLatencySeconds,
        deliveryState: timing.deliveryState,
      };
    }),
  };
}
