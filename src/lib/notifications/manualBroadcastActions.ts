"use server";

import { after } from "next/server";
import { loadManagerPersonnelContext, loadManagerWorkbookContext } from "@/lib/readModels/managerWorkbookContext";
import { runDelivery } from "./engine/delivery";
import {
  sendManagerBroadcastNotification,
  type BroadcastAudienceKind,
  type BroadcastUnresolvedPerson,
} from "./engine/manualBroadcast";
import { listRecentManagerNotificationBatches, RECENT_MANAGER_BROADCASTS_LIMIT } from "./engine/store";
import { formatWorkerErrorLog, runStage, sanitizeWorkerError, WorkerStageError } from "./engine/workerErrors";

const MAX_TARGET_IDS = 5000; // generously above any realistic roster size -- a defensive upper bound, not a real limit.
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

export interface SendManagerBroadcastActionInput {
  audienceKind: BroadcastAudienceKind;
  /** Untrusted candidate roster ids -- re-validated against the freshly-fetched roster before anything is sent (see `sendManagerBroadcastNotification`). */
  targetPersonIds: string[];
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
  if (input.audienceKind !== "person" && input.audienceKind !== "people" && input.audienceKind !== "everyone") {
    return false;
  }
  if (!Array.isArray(input.targetPersonIds) || input.targetPersonIds.length > MAX_TARGET_IDS) return false;
  if (!input.targetPersonIds.every((id) => typeof id === "string")) return false;
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
  createdAt: string;
  resolvedRecipientCount: number;
  pushCapableCount: number;
  inboxOnlyCount: number;
  unresolvedCount: number;
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
 */
export async function getRecentManagerBroadcastsAction(): Promise<GetRecentManagerBroadcastsResult> {
  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const rows = await listRecentManagerNotificationBatches(RECENT_MANAGER_BROADCASTS_LIMIT);
  return {
    ok: true,
    items: rows.map((row) => ({
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
    })),
  };
}
