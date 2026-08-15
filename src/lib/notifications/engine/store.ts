import "server-only";
import { SEMANTIC_CHANGE_DEBOUNCE_MINUTES } from "@/lib/config/notificationTiming";
import { getNotificationServiceClient } from "./serviceClient";
import type { FactChange } from "./diffFacts";
import type { SemanticFact, SemanticFactCategory, SemanticFactValue } from "./semanticFacts";

// ---------------------------------------------------------------------------
// JSONB storage helpers -- a fact can legitimately be "absent" (the entity
// didn't exist before/doesn't exist now), which is a real, meaningful value
// distinct from SQL NULL (which the jsonb columns below reject via `not
// null`). Represented as a small sentinel object rather than a JSON `null`
// literal so it round-trips unambiguously through postgrest.
// ---------------------------------------------------------------------------

const ABSENT_MARKER = { absent: true } as const;

function toStoredValue(value: SemanticFactValue | null): Record<string, unknown> {
  return value === null ? ABSENT_MARKER : (value as unknown as Record<string, unknown>);
}

function fromStoredValue(stored: Record<string, unknown>): SemanticFactValue | null {
  if (stored && (stored as { absent?: boolean }).absent === true) return null;
  return stored as unknown as SemanticFactValue;
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

export interface BaselineAdvanceResult {
  action: "initialized" | "rolled_over" | "unchanged";
  previousWeekStart: string | null;
}

/** The ONLY writer of `notification_baseline_state` -- see the migration's own comment for the atomicity guarantee this RPC provides. */
export async function advanceNotificationBaseline(weekStart: string): Promise<BaselineAdvanceResult> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .rpc("advance_notification_baseline", { p_week_start: weekStart })
    .single<{ action: string; previous_week_start: string | null }>();

  if (error || !data) throw error ?? new Error("advance_notification_baseline returned no row");
  return {
    action: data.action as BaselineAdvanceResult["action"],
    previousWeekStart: data.previous_week_start,
  };
}

export interface BaselineStateSnapshot {
  initialized: boolean;
  currentWeekStart: string | null;
}

/** Read-only peek at the baseline row -- used by dry-run mode, which must never call the mutating `advance_notification_baseline` RPC. */
export async function peekBaselineState(): Promise<BaselineStateSnapshot> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("notification_baseline_state")
    .select("initialized, current_week_start")
    .eq("id", 1)
    .maybeSingle<{ initialized: boolean; current_week_start: string | null }>();
  if (error) throw error;
  return { initialized: data?.initialized ?? false, currentWeekStart: data?.current_week_start ?? null };
}

// ---------------------------------------------------------------------------
// Observed facts (last settled truth for the current week)
// ---------------------------------------------------------------------------

export async function getObservedFacts(weekStart: string): Promise<Map<string, SemanticFact>> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("observed_notification_facts")
    .select("fact_key, category, fact_value")
    .eq("week_start_date", weekStart);
  if (error) throw error;

  const facts = new Map<string, SemanticFact>();
  for (const row of (data ?? []) as { fact_key: string; category: SemanticFactCategory; fact_value: Record<string, unknown> }[]) {
    facts.set(row.fact_key, { factKey: row.fact_key, category: row.category, value: row.fact_value as unknown as SemanticFactValue });
  }
  return facts;
}

/** Bulk delete+insert for a week's observed facts -- used only for the silent baseline capture (first run / week rollover), never during an ordinary tick's settle flow (see `setObservedFact`). */
export async function seedObservedFacts(weekStart: string, facts: ReadonlyMap<string, SemanticFact>): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error: deleteError } = await supabase
    .from("observed_notification_facts")
    .delete()
    .eq("week_start_date", weekStart);
  if (deleteError) throw deleteError;

  if (facts.size === 0) return;

  const rows = [...facts.values()].map((fact) => ({
    week_start_date: weekStart,
    fact_key: fact.factKey,
    category: fact.category,
    fact_value: fact.value,
  }));
  const { error: insertError } = await supabase.from("observed_notification_facts").insert(rows);
  if (insertError) throw insertError;
}

/** Updates exactly one fact's settled value -- called once a pending change for it has settled. */
export async function setObservedFact(weekStart: string, factKey: string, category: SemanticFactCategory, value: SemanticFactValue | null): Promise<void> {
  const supabase = getNotificationServiceClient();
  if (value === null) {
    const { error } = await supabase
      .from("observed_notification_facts")
      .delete()
      .eq("week_start_date", weekStart)
      .eq("fact_key", factKey);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("observed_notification_facts")
    .upsert(
      { week_start_date: weekStart, fact_key: factKey, category, fact_value: value },
      { onConflict: "week_start_date,fact_key" },
    );
  if (error) throw error;
}

export async function clearWeekState(weekStart: string): Promise<void> {
  const supabase = getNotificationServiceClient();
  await supabase.from("observed_notification_facts").delete().eq("week_start_date", weekStart);
  await supabase.from("pending_notification_changes").delete().eq("week_start_date", weekStart);
}

// ---------------------------------------------------------------------------
// Pending (debounced) changes
// ---------------------------------------------------------------------------

/**
 * Applies a fresh tick's fact readings against the pending-changes
 * table: opens a new debounce candidate, extends an already-open one
 * (recomputing `settle_at` to `now() + debounce`, keeping
 * `original_value` from the first observation -- see the column
 * omission trick in the upsert payload below), or cancels one that has
 * returned to its original value within the window (PR #30 spec section
 * 11). Returns nothing; `changeDetection.ts` re-reads what's actually
 * due separately via `claimDuePendingChanges`.
 *
 * Takes `changedKeys` (this tick's observed-vs-fresh diff) AND every
 * currently-open pending row for the week -- not `changedKeys` alone --
 * as its candidate set. This matters for the exact "evening -> morning
 * -> evening" scenario the spec calls out: once "morning" is observed,
 * a pending row opens (original=evening, latest=morning) while
 * `observed_notification_facts` itself is untouched (still "evening")
 * until the row eventually settles. If the NEXT tick reads "evening"
 * again, that no longer differs from the still-unsettled observed value
 * -- so it would never appear in a plain observed-vs-fresh diff at all,
 * and the open pending row would be silently orphaned to settle later
 * as a false "evening -> morning" notification. Re-checking every open
 * row against the fresh reading each tick (regardless of whether it's
 * in `changedKeys`) is what correctly cancels it instead.
 */
export async function applyPendingChanges(
  weekStart: string,
  changes: readonly FactChange[],
  freshFacts: ReadonlyMap<string, SemanticFact>,
): Promise<void> {
  const supabase = getNotificationServiceClient();

  // Every currently-open pending row for the week -- not just the keys
  // this tick's diff touched -- see this function's own docstring for
  // why a key that reverted to its original value can be absent from
  // `changes` entirely while still needing to be cancelled.
  const { data: existingRows, error: fetchError } = await supabase
    .from("pending_notification_changes")
    .select("fact_key, category, original_value")
    .eq("week_start_date", weekStart);
  if (fetchError) throw fetchError;

  const existingByKey = new Map(
    ((existingRows ?? []) as { fact_key: string; category: SemanticFactCategory; original_value: Record<string, unknown> }[]).map(
      (row) => [row.fact_key, { category: row.category, originalValue: fromStoredValue(row.original_value) }],
    ),
  );

  const now = new Date();
  const settleAt = new Date(now.getTime() + SEMANTIC_CHANGE_DEBOUNCE_MINUTES * 60_000).toISOString();

  const toUpsert: Record<string, unknown>[] = [];
  const toCancel: string[] = [];
  const handledKeys = new Set<string>();

  function reconcile(key: string, category: SemanticFactCategory, freshValue: SemanticFactValue | null, fallbackOriginal: SemanticFactValue | null): void {
    if (handledKeys.has(key)) return;
    handledKeys.add(key);

    const existing = existingByKey.get(key);
    const originalValue = existing ? existing.originalValue : fallbackOriginal;

    if (JSON.stringify(originalValue) === JSON.stringify(freshValue)) {
      if (existing) toCancel.push(key);
      return;
    }

    toUpsert.push({
      week_start_date: weekStart,
      fact_key: key,
      category,
      original_value: toStoredValue(originalValue),
      latest_value: toStoredValue(freshValue),
      last_changed_at: now.toISOString(),
      settle_at: settleAt,
      status: "pending",
    });
  }

  for (const change of changes) {
    reconcile(change.factKey, change.category, change.newValue, change.oldValue);
  }

  // Every open pending row NOT touched by this tick's diff means the
  // fresh reading now matches the still-unsettled observed value again
  // -- re-check it against its OWN original value, since that's exactly
  // the "reverted to original" case a plain observed-vs-fresh diff
  // cannot see.
  for (const [key, existing] of existingByKey) {
    if (handledKeys.has(key)) continue;
    const freshValue = freshFacts.get(key)?.value ?? null;
    reconcile(key, existing.category, freshValue, existing.originalValue);
  }

  if (toCancel.length > 0) {
    const { error } = await supabase
      .from("pending_notification_changes")
      .delete()
      .eq("week_start_date", weekStart)
      .in("fact_key", toCancel);
    if (error) throw error;
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("pending_notification_changes")
      .upsert(toUpsert, { onConflict: "week_start_date,fact_key" });
    if (error) throw error;
  }
}

export interface ClaimedPendingChange {
  id: string;
  weekStartDate: string;
  factKey: string;
  category: SemanticFactCategory;
  originalValue: SemanticFactValue | null;
  latestValue: SemanticFactValue | null;
}

export async function claimDuePendingChanges(limit = 200): Promise<ClaimedPendingChange[]> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase.rpc("claim_due_pending_notification_changes", { p_limit: limit });
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    weekStartDate: row.week_start_date as string,
    factKey: row.fact_key as string,
    category: row.category as SemanticFactCategory,
    originalValue: fromStoredValue(row.original_value as Record<string, unknown>),
    latestValue: fromStoredValue(row.latest_value as Record<string, unknown>),
  }));
}

export async function deletePendingChange(id: string): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error } = await supabase.from("pending_notification_changes").delete().eq("id", id);
  if (error) throw error;
}

/** Read-only count of every open (still debouncing) pending change for the week. */
export async function countOpenPendingChanges(weekStart: string): Promise<number> {
  const supabase = getNotificationServiceClient();
  const { count, error } = await supabase
    .from("pending_notification_changes")
    .select("id", { count: "exact", head: true })
    .eq("week_start_date", weekStart);
  if (error) throw error;
  return count ?? 0;
}

/** Read-only count of pending changes already due to settle -- dry-run mode's estimate; never claims/mutates. */
export async function peekDuePendingChangesCount(weekStart: string): Promise<number> {
  const supabase = getNotificationServiceClient();
  const { count, error } = await supabase
    .from("pending_notification_changes")
    .select("id", { count: "exact", head: true })
    .eq("week_start_date", weekStart)
    .eq("status", "pending")
    .lte("settle_at", new Date().toISOString());
  if (error) throw error;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Notification jobs (outbox)
// ---------------------------------------------------------------------------

export interface NewNotificationJob {
  category: string;
  recipientUserId: string;
  title: string;
  body: string;
  path: string;
  tag?: string;
  dedupeKey: string;
  scheduledFor: string;
  sourceRef?: string;
}

/** Idempotent by `dedupe_key` -- a retried/duplicate worker tick never creates two logical jobs for the same event. Returns true when a NEW job was inserted (false when the dedupe_key already existed). */
export async function insertNotificationJobIfAbsent(job: NewNotificationJob): Promise<boolean> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("notification_jobs")
    .insert({
      category: job.category,
      recipient_user_id: job.recipientUserId,
      title: job.title,
      body: job.body,
      path: job.path,
      tag: job.tag ?? null,
      dedupe_key: job.dedupeKey,
      scheduled_for: job.scheduledFor,
      source_ref: job.sourceRef ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Unique violation on dedupe_key is the expected, harmless outcome of
    // a duplicate/retried job-creation attempt -- never a real failure.
    if ((error as { code?: string }).code === "23505") return false;
    throw error;
  }
  return data !== null;
}

/**
 * Upsert semantics for time-based reminders (tomorrow shift/duty), whose
 * content can legitimately change before send (the underlying assignment
 * changed) -- see PR #30 spec sections 16-17. Only touches a job still
 * `pending`; a job already claimed/completed is never rewritten out from
 * under an in-flight or already-delivered send.
 */
export async function upsertPendingReminderJob(job: NewNotificationJob): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error } = await supabase
    .from("notification_jobs")
    .upsert(
      {
        category: job.category,
        recipient_user_id: job.recipientUserId,
        title: job.title,
        body: job.body,
        path: job.path,
        tag: job.tag ?? null,
        dedupe_key: job.dedupeKey,
        scheduled_for: job.scheduledFor,
        source_ref: job.sourceRef ?? null,
        status: "pending",
      },
      { onConflict: "dedupe_key" },
    )
    .eq("status", "pending");
  if (error) throw error;
}

/** Cancels a still-pending reminder job (e.g. the underlying shift/duty disappeared before send) -- never touches a claimed/completed job. */
/** Every still-`pending` job's dedupe_key starting with `prefix` -- used to find stale reminder jobs (an assignment that no longer exists) that need cancelling. */
export async function listPendingJobDedupeKeysByPrefix(prefix: string): Promise<string[]> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("notification_jobs")
    .select("dedupe_key")
    .eq("status", "pending")
    .like("dedupe_key", `${prefix}%`);
  if (error) throw error;
  return ((data ?? []) as { dedupe_key: string }[]).map((row) => row.dedupe_key);
}

export async function cancelPendingReminderJob(dedupeKey: string): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error } = await supabase
    .from("notification_jobs")
    .update({ status: "cancelled" })
    .eq("dedupe_key", dedupeKey)
    .eq("status", "pending");
  if (error) throw error;
}

export interface ClaimedNotificationJob {
  id: string;
  category: string;
  recipientUserId: string;
  title: string;
  body: string;
  path: string;
  tag: string | null;
  attempts: number;
  maxAttempts: number;
}

export async function claimDueNotificationJobs(limit = 200): Promise<ClaimedNotificationJob[]> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase.rpc("claim_due_notification_jobs", { p_limit: limit });
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    category: row.category as string,
    recipientUserId: row.recipient_user_id as string,
    title: row.title as string,
    body: row.body as string,
    path: row.path as string,
    tag: row.tag as string | null,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
  }));
}

export type JobFinalStatus = "completed" | "failed" | "pending" | "skipped";

/** Read-only count of pending jobs already due -- dry-run mode's estimate; never claims/mutates. */
export async function peekDueJobsCount(): Promise<number> {
  const supabase = getNotificationServiceClient();
  const { count, error } = await supabase
    .from("notification_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function setJobStatus(id: string, status: JobFinalStatus, lastError?: string): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error } = await supabase
    .from("notification_jobs")
    .update({ status, last_error: lastError ?? null })
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Deliveries (per push subscription / device)
// ---------------------------------------------------------------------------

export interface ActiveSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Every active push subscription row for an arbitrary recipient -- requires the service-role client, since this is never the calling user's own session. */
export async function getActiveSubscriptionsForUser(userId: string): Promise<ActiveSubscription[]> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as ActiveSubscription[];
}

export interface DeliveryRow {
  id: string;
  pushSubscriptionId: string;
  status: "pending" | "sent" | "failed_permanent" | "failed_transient";
  attempts: number;
}

export async function ensureDeliveryRows(jobId: string, subscriptionIds: readonly string[]): Promise<void> {
  if (subscriptionIds.length === 0) return;
  const supabase = getNotificationServiceClient();
  const rows = subscriptionIds.map((subscriptionId) => ({ job_id: jobId, push_subscription_id: subscriptionId }));
  const { error } = await supabase
    .from("notification_deliveries")
    .upsert(rows, { onConflict: "job_id,push_subscription_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function getDeliveriesForJob(jobId: string): Promise<DeliveryRow[]> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("notification_deliveries")
    .select("id, push_subscription_id, status, attempts")
    .eq("job_id", jobId);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    pushSubscriptionId: row.push_subscription_id as string,
    status: row.status as DeliveryRow["status"],
    attempts: row.attempts as number,
  }));
}

/** Records the terminal (or transient-retry) outcome of one send attempt. Attempt counting itself is bumped separately via `incrementDeliveryAttempts` before the send, since postgrest's `update()` has no atomic increment expression. */
export async function updateDeliveryOutcome(
  deliveryId: string,
  status: "sent" | "failed_permanent" | "failed_transient",
  lastError?: string,
): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error } = await supabase
    .from("notification_deliveries")
    .update({
      status,
      last_attempted_at: new Date().toISOString(),
      last_error: lastError ?? null,
    })
    .eq("id", deliveryId);
  if (error) throw error;
}

export async function incrementDeliveryAttempts(deliveryId: string, currentAttempts: number): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error } = await supabase
    .from("notification_deliveries")
    .update({ attempts: currentAttempts + 1 })
    .eq("id", deliveryId);
  if (error) throw error;
}

export async function deletePushSubscriptionById(subscriptionId: string): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("id", subscriptionId);
  if (error) throw error;
}
