"use server";

import { isAudienceGroupKey, type AudienceGroupKey } from "@/lib/domain/audienceGroups";
import { loadManagerPersonnelContext, loadManagerWorkbookContext } from "@/lib/readModels/managerWorkbookContext";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import {
  cancelScheduledBroadcast,
  createScheduledBroadcast,
  editScheduledBroadcast,
  sendScheduledBroadcastNow,
  type BroadcastAudienceKind,
  type ManagerScheduledBroadcastRow,
  type ManagerScheduledBroadcastStatus,
} from "./engine/scheduledBroadcast";
import { listActiveManagerScheduledBroadcasts } from "./engine/store";

const MAX_TARGET_IDS = 5000; // same generous defensive bound as the immediate-send action, not a real limit.
const MAX_IDEMPOTENCY_KEY_LENGTH = 200; // same bound as the immediate-send action's own idempotencyKey.

export interface ScheduledBroadcastActionInput {
  audienceKind: BroadcastAudienceKind;
  /** Untrusted candidate roster ids -- re-validated against the freshly-fetched roster before anything is saved (see `createScheduledBroadcast`/`editScheduledBroadcast`). Ignored unless `audienceKind` is `"person"`/`"people"`. */
  targetPersonIds: string[];
  /** Untrusted candidate group keys -- re-validated against the canonical `AudienceGroupKey` enum before anything is saved. Ignored unless `audienceKind === "groups"`. */
  groupKeys?: string[];
  /** "לא לשלוח ל" -- untrusted candidate roster ids, ALWAYS re-validated against the freshly-fetched roster, independent of `audienceKind`. */
  excludedPersonIds?: string[];
  title: string;
  body: string;
  /** Israel-local civil date, "YYYY-MM-DD". */
  scheduledDate: string;
  /** Israel-local clock hour, 0-23. */
  scheduledHour: number;
  /** Israel-local clock minute, 0-59. */
  scheduledMinute: number;
}

/** CREATE-only -- edit/cancel/send-now never create or replace a schedule's own creation-idempotency key (see `createScheduledBroadcast`). */
export interface CreateScheduledBroadcastActionInput extends ScheduledBroadcastActionInput {
  /** Generated once per compose session on the client (e.g. `crypto.randomUUID()`), unchanged across a retry -- the SAME pattern PR #78's immediate send already uses for its own `idempotencyKey`. */
  idempotencyKey: string;
}

function isValidRequestShape(input: ScheduledBroadcastActionInput): boolean {
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
  if (typeof input.scheduledDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) return false;
  if (!Number.isInteger(input.scheduledHour) || !Number.isInteger(input.scheduledMinute)) return false;
  return true;
}

function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === "string" && key.length >= 8 && key.length <= MAX_IDEMPOTENCY_KEY_LENGTH;
}

export interface ScheduledBroadcastView {
  id: string;
  status: ManagerScheduledBroadcastStatus;
  audienceKind: BroadcastAudienceKind;
  targetPersonIds: string[];
  /** Dynamic audience group keys -- meaningful only when `audienceKind === "groups"`. Display/re-edit intent only -- `targetPersonIds` is the already-resolved snapshot dispatch actually uses (frozen at save/edit time). */
  audienceGroupKeys: AudienceGroupKey[];
  /** "לא לשלוח ל" intent -- already baked into `targetPersonIds` at save time. */
  excludedPersonIds: string[];
  title: string;
  body: string;
  /** The stored UTC instant, ISO -- kept only for stable sort/identity; the UI reads the two fields below for display. */
  scheduledFor: string;
  /** Asia/Jerusalem civil date, "YYYY-MM-DD" -- converted server-side (`getJerusalemLocalNow`) so the client never re-derives a timezone conversion itself. */
  scheduledLocalDate: string;
  /** Asia/Jerusalem minute-of-day (0-1439) -- pairs with `scheduledLocalDate` for `lib/presentation/scheduledBroadcast.ts`'s pure display formatters. */
  scheduledLocalMinuteOfDay: number;
  createdByPersonName: string;
  lastChangedByPersonName: string | null;
}

function toView(row: ManagerScheduledBroadcastRow): ScheduledBroadcastView {
  const local = getJerusalemLocalNow(new Date(row.scheduledFor));
  return {
    id: row.id,
    status: row.status,
    audienceKind: row.audienceKind,
    targetPersonIds: row.targetPersonIds,
    audienceGroupKeys: row.audienceGroupKeys,
    excludedPersonIds: row.excludedPersonIds,
    title: row.title,
    body: row.body,
    scheduledFor: row.scheduledFor,
    scheduledLocalDate: local.date,
    scheduledLocalMinuteOfDay: local.minuteOfDay,
    createdByPersonName: row.createdByPersonName,
    lastChangedByPersonName: row.lastChangedByPersonName,
  };
}

export type ScheduledBroadcastActionResult =
  | { ok: true; item: ScheduledBroadcastView }
  | { ok: false; error: string };

/**
 * Manager Area's "תזמון" path -- saves a scheduled broadcast WITHOUT
 * creating any `notification_jobs` yet (spec §2). Same authorization
 * sequence as the immediate-send action
 * (`sendManagerBroadcastAction`): manager-gated via
 * `loadManagerWorkbookContext`, and every target id re-validated against
 * the freshly-fetched roster (`createScheduledBroadcast`) -- never a
 * client-supplied roster.
 *
 * `input.idempotencyKey` makes CREATION itself exactly-once (a double-
 * clicked "שמירת תזמון", or a retried request, must never produce two
 * scheduled rows) -- the same client-compose-session-key pattern PR #78's
 * immediate send already uses, enforced server-side by
 * `createScheduledBroadcast`. This is a SEPARATE idempotency boundary
 * from dispatch's own `scheduled:<id>` key.
 */
export async function createScheduledBroadcastAction(
  input: CreateScheduledBroadcastActionInput,
): Promise<ScheduledBroadcastActionResult> {
  if (!isValidRequestShape(input) || !isValidIdempotencyKey(input.idempotencyKey)) {
    return { ok: false, error: "invalid_request" };
  }

  const contextResult = await loadManagerWorkbookContext(["personnel"]);
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const { manager, people } = contextResult.context;

  const outcome = await createScheduledBroadcast({
    manager,
    people,
    audienceKind: input.audienceKind,
    targetPersonIds: input.targetPersonIds,
    groupKeys: (input.groupKeys ?? []) as AudienceGroupKey[],
    excludedPersonIds: input.excludedPersonIds ?? [],
    title: input.title,
    body: input.body,
    scheduledDate: input.scheduledDate,
    scheduledHour: input.scheduledHour,
    scheduledMinute: input.scheduledMinute,
    createIdempotencyKey: input.idempotencyKey,
  });

  if (!outcome.ok) return { ok: false, error: outcome.error };
  return { ok: true, item: toView(outcome.row) };
}

/**
 * Edits a still-`'scheduled'` broadcast -- re-validates/re-resolves the
 * whole request from scratch, exactly like creation (spec §3: an
 * intentional audience edit, including re-selecting "everyone", legitimately
 * replaces the frozen snapshot). Fails truthfully once dispatch has
 * claimed it (`already_started`) rather than silently discarding the
 * edit.
 */
export async function editScheduledBroadcastAction(
  id: string,
  input: ScheduledBroadcastActionInput,
): Promise<ScheduledBroadcastActionResult> {
  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "invalid_request" };
  if (!isValidRequestShape(input)) return { ok: false, error: "invalid_request" };

  const contextResult = await loadManagerWorkbookContext(["personnel"]);
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const { manager, people } = contextResult.context;

  const outcome = await editScheduledBroadcast(id, {
    manager,
    people,
    audienceKind: input.audienceKind,
    targetPersonIds: input.targetPersonIds,
    groupKeys: (input.groupKeys ?? []) as AudienceGroupKey[],
    excludedPersonIds: input.excludedPersonIds ?? [],
    title: input.title,
    body: input.body,
    scheduledDate: input.scheduledDate,
    scheduledHour: input.scheduledHour,
    scheduledMinute: input.scheduledMinute,
  });

  if (!outcome.ok) return { ok: false, error: outcome.error };
  return { ok: true, item: toView(outcome.row) };
}

export type CancelScheduledBroadcastActionResult = { ok: true } | { ok: false; error: string };

/** Cancellation requires the same manager gate; the actual write is guarded to `status = 'scheduled'` inside `cancelScheduledBroadcast`. */
export async function cancelScheduledBroadcastAction(id: string): Promise<CancelScheduledBroadcastActionResult> {
  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "invalid_request" };

  const contextResult = await loadManagerWorkbookContext(["personnel"]);
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const outcome = await cancelScheduledBroadcast(id, contextResult.context.manager);
  if (!outcome.ok) return { ok: false, error: outcome.error };
  return { ok: true };
}

export type SendScheduledBroadcastNowActionResult =
  | { ok: true; batchId: string; resolvedRecipientCount: number }
  | { ok: false; error: string };

/**
 * "שלח עכשיו" -- claims and dispatches through the EXACT SAME
 * `dispatchScheduledBroadcast` path the worker tick uses (spec §4), using
 * the roster THIS request already fetched for its own manager
 * authorization (never a second Google read).
 */
export async function sendScheduledBroadcastNowAction(id: string): Promise<SendScheduledBroadcastNowActionResult> {
  if (typeof id !== "string" || id.length === 0) return { ok: false, error: "invalid_request" };

  const contextResult = await loadManagerWorkbookContext(["personnel"]);
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const { manager, people } = contextResult.context;

  const outcome = await sendScheduledBroadcastNow(id, people, manager);
  if (!outcome.ok) return { ok: false, error: outcome.error };
  return { ok: true, batchId: outcome.batchId, resolvedRecipientCount: outcome.resolvedRecipientCount };
}

export type ListActiveScheduledBroadcastsResult =
  | { ok: true; items: ScheduledBroadcastView[] }
  | { ok: false; error: string };

/**
 * The "🕒 התראות מתוזמנות" section's own data -- polled every ~17s while
 * there are active items (spec §7), so this deliberately uses the
 * LIGHTWEIGHT `loadManagerPersonnelContext` boundary (personnel-only,
 * cached workbook read) rather than `loadManagerWorkbookContext` -- this
 * action needs nothing from Schedule/Settings/Potential, and repeating
 * that full parse on every poll would be wasted work and needlessly
 * couples this poll to unrelated Schedule/Settings health. Still
 * manager-gated exactly like every other action here.
 */
export async function listActiveScheduledBroadcastsAction(): Promise<ListActiveScheduledBroadcastsResult> {
  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const rows = await listActiveManagerScheduledBroadcasts();
  return { ok: true, items: rows.map(toView) };
}
