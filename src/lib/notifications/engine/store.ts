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

/** Clears a week's observed facts and pending changes (week rollover). Throws on either delete failing -- a partial/failed cleanup must never be silently treated as success (that would leak the previous week's stale state into the new week's diff base). */
export async function clearWeekState(weekStart: string): Promise<void> {
  const supabase = getNotificationServiceClient();

  const { error: observedError } = await supabase
    .from("observed_notification_facts")
    .delete()
    .eq("week_start_date", weekStart);
  if (observedError) throw observedError;

  const { error: pendingError } = await supabase
    .from("pending_notification_changes")
    .delete()
    .eq("week_start_date", weekStart);
  if (pendingError) throw pendingError;
}

// ---------------------------------------------------------------------------
// Pending (debounced) changes
// ---------------------------------------------------------------------------

/**
 * Applies a fresh tick's fact readings against the pending-changes
 * table. For each candidate key, compares the fresh value against BOTH
 * the pending row's `original_value` and its `latest_value` -- never
 * `original_value` alone, and NEVER treats a worker tick itself as
 * evidence of a new change:
 *
 *  - fresh === original_value -> the value returned to where it started;
 *    delete/cancel the row, send nothing (spec section 11: "evening ->
 *    morning -> evening... then no notification should be sent").
 *  - fresh === latest_value (and !== original_value) -> this is the SAME
 *    value already recorded from a previous tick, merely observed again
 *    -- the row is left COMPLETELY untouched (`last_changed_at`/
 *    `settle_at` never move). This is the fix for the bug where a
 *    5-minute worker cadence re-diffing an unsettled `observed`-vs-fresh
 *    pair every tick would otherwise keep pushing `settle_at` forward
 *    forever and the change would never settle.
 *  - fresh differs from BOTH -> a genuinely NEW value since the row was
 *    last updated; extends the debounce (`last_changed_at = now()`,
 *    `settle_at = now() + debounce`) and updates `latest_value`,
 *    preserving `original_value` from the first observation untouched.
 *  - no existing row and fresh !== the diff's own oldValue -> opens a
 *    brand-new pending row.
 *
 * Takes `changes` (this tick's observed-vs-fresh diff) AND every
 * currently-open pending row for the week -- not `changes` alone -- as
 * its candidate set, so a key that reverted to its original value can
 * still be detected and cancelled even on a tick where it no longer
 * differs from the still-unsettled `observed_notification_facts` value
 * (and therefore wouldn't appear in `changes` at all).
 */
export async function applyPendingChanges(
  weekStart: string,
  changes: readonly FactChange[],
  freshFacts: ReadonlyMap<string, SemanticFact>,
): Promise<void> {
  const supabase = getNotificationServiceClient();

  // Every currently-open pending row for the week -- not just the keys
  // this tick's diff touched -- see this function's own docstring.
  const { data: existingRows, error: fetchError } = await supabase
    .from("pending_notification_changes")
    .select("fact_key, category, original_value, latest_value")
    .eq("week_start_date", weekStart);
  if (fetchError) throw fetchError;

  const existingByKey = new Map(
    (
      (existingRows ?? []) as {
        fact_key: string;
        category: SemanticFactCategory;
        original_value: Record<string, unknown>;
        latest_value: Record<string, unknown>;
      }[]
    ).map((row) => [
      row.fact_key,
      { category: row.category, originalValue: fromStoredValue(row.original_value), latestValue: fromStoredValue(row.latest_value) },
    ]),
  );

  const now = new Date();
  const settleAt = new Date(now.getTime() + SEMANTIC_CHANGE_DEBOUNCE_MINUTES * 60_000).toISOString();

  const toUpsert: Record<string, unknown>[] = [];
  const toCancel: string[] = [];
  const handledKeys = new Set<string>();

  function reconcile(
    key: string,
    category: SemanticFactCategory,
    freshValue: SemanticFactValue | null,
    fallbackOriginal: SemanticFactValue | null,
  ): void {
    if (handledKeys.has(key)) return;
    handledKeys.add(key);

    const existing = existingByKey.get(key);
    const originalValue = existing ? existing.originalValue : fallbackOriginal;

    if (JSON.stringify(originalValue) === JSON.stringify(freshValue)) {
      if (existing) toCancel.push(key);
      return;
    }

    // The fresh value is identical to what's already recorded as
    // `latest_value` -- this is the SAME still-debouncing change being
    // observed again by another worker tick, not a new change. Leave
    // the row's timestamps completely alone; polling itself is never
    // evidence of a new change.
    if (existing && JSON.stringify(existing.latestValue) === JSON.stringify(freshValue)) {
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
  // -- re-check it against its own original/latest values, since that's
  // exactly the "reverted to original" case a plain observed-vs-fresh
  // diff cannot see.
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
 * `pending`; a job already claimed/completed/failed/skipped/cancelled is
 * never rewritten out from under an in-flight or already-resolved send.
 *
 * ALWAYS goes through the `upsert_pending_reminder_job` RPC -- never a
 * plain `.upsert(...).eq('status','pending')` client call. That chained
 * `.eq()` looks like a WHERE guard but is NOT one for an upsert: PostgREST
 * request-level filters are not applied to a merge-duplicates upsert's
 * `ON CONFLICT ... DO UPDATE` action, so that call unconditionally
 * revived ANY existing row back to 'pending' regardless of its real
 * status -- confirmed as a real Production incident (see the migration's
 * own comment for the exact tick-by-tick mechanism). The RPC expresses
 * the guard as a genuine `ON CONFLICT ... DO UPDATE ... WHERE` clause in
 * SQL instead, which Postgres actually honors.
 */
export async function upsertPendingReminderJob(job: NewNotificationJob): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error } = await supabase.rpc("upsert_pending_reminder_job", {
    p_category: job.category,
    p_recipient_user_id: job.recipientUserId,
    p_title: job.title,
    p_body: job.body,
    p_path: job.path,
    p_tag: job.tag ?? null,
    p_dedupe_key: job.dedupeKey,
    p_scheduled_for: job.scheduledFor,
    p_source_ref: job.sourceRef ?? null,
  });
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

export interface RecentSettledJobRow {
  id: string;
  category: string;
  title: string;
  body: string;
  path: string;
  sourceRef: string | null;
  createdAt: string;
}

/**
 * Read-only lookup of ONE recipient's own recent settled-change jobs --
 * powers the personal dashboard's "מה השתנה" recap (PR #36), never the
 * worker itself. Deliberately selects ONLY presentation-safe columns --
 * never `recipient_user_id`, `dedupe_key`, `attempts`, `last_error`,
 * `status`, `scheduled_for`, `claimed_at`, `tag`, or `updated_at`. The
 * caller (`lib/readModels/recentDashboardChanges.ts`) maps this straight
 * into a small typed read model -- never a raw row into React.
 *
 * Deliberately NO `status` filter: whether a job's push delivery
 * completed, was skipped, or failed is irrelevant here -- a settled
 * semantic change is a real event the moment its job row exists,
 * independent of delivery outcome. Coupling this recap's visibility to
 * delivery status would be exactly the "second baseline system" this
 * feature is designed to avoid becoming.
 */
export async function getRecentSettledJobsForRecipient(
  recipientUserId: string,
  categories: readonly string[],
  sinceIso: string,
  limit: number,
): Promise<RecentSettledJobRow[]> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("notification_jobs")
    .select("id, category, title, body, path, source_ref, created_at")
    .eq("recipient_user_id", recipientUserId)
    .in("category", categories)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    category: row.category as string,
    title: row.title as string,
    body: row.body as string,
    path: row.path as string,
    sourceRef: row.source_ref as string | null,
    createdAt: row.created_at as string,
  }));
}

// ---------------------------------------------------------------------------
// Notification center -- inbox read/dismiss state
//
// Read-only projection + minimal per-user state over the SAME
// notification_jobs outbox above -- never a second notification-rule
// engine, never a new column on notification_jobs. Every function here
// requires the caller to already have a SERVER-VERIFIED recipientUserId
// (see `lib/readModels/notificationInbox.ts`, which resolves it via
// `getAuthenticatedIdentity()` exactly like `recentDashboardChanges.ts`
// already does) -- never a client-supplied id, and never called from
// anywhere but a Server Action/Server Component.
// ---------------------------------------------------------------------------

/** A bounded inbox window -- a bell popover, never a full notification archive (same "bounded, not an archive" convention `RECENT_DASHBOARD_CHANGES_LIMIT` already establishes). The unread badge counts only within this window. */
export const NOTIFICATION_INBOX_LIMIT = 50;

export interface InboxJobRow {
  id: string;
  category: string;
  title: string;
  body: string;
  path: string;
  createdAt: string;
  scheduledFor: string;
}

/** The current user's "נקה התראות" cutoff -- `-infinity` (i.e. no cutoff at all) when the user has never cleared their inbox. Never throws on a missing row; that's the ordinary, expected first-visit state. */
export async function getInboxClearedBefore(userId: string): Promise<string> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("notification_inbox_state")
    .select("cleared_before")
    .eq("user_id", userId)
    .maybeSingle<{ cleared_before: string }>();
  if (error) throw error;
  return data?.cleared_before ?? "-infinity";
}

/**
 * One recipient's own inbox jobs -- filtered to `scheduled_for <= now()`
 * (a time-based reminder like `tomorrow_shift` is upserted repeatedly
 * from just after midnight, hours before its real 20:00 `scheduled_for`;
 * gating on `scheduled_for` rather than `created_at` means it appears in
 * the inbox at the moment it was actually meant to notify, never hours
 * early) AND `scheduled_for > clearedBefore` (the user's own "נקה
 * התראות" cutoff, passed in by the caller after `getInboxClearedBefore`
 * -- never re-read here, so both queries always agree on the same
 * instant). No `status` filter beyond excluding `cancelled` (see
 * `INELIGIBLE_INBOX_STATUS` below) -- delivery OUTCOME is otherwise
 * irrelevant to whether the logical notification happened, same
 * reasoning as `getRecentSettledJobsForRecipient`: completed/skipped
 * (no subscription)/failed/still-pending-but-due all represent a real
 * logical notification, so a push-disabled user must see the exact same
 * inbox a push-enabled user would. `cancelled` is different in KIND, not
 * just outcome: a reminder job can be created ahead of its `scheduled_for`
 * and later cancelled (`cancelPendingReminderJob`) because the underlying
 * assignment disappeared/changed before it ever fired -- once
 * `scheduled_for` passes, that row must never resurface as if it still
 * described something real.
 */
const INELIGIBLE_INBOX_STATUS = "cancelled";

export async function getInboxJobsForRecipient(
  recipientUserId: string,
  clearedBefore: string,
  limit: number = NOTIFICATION_INBOX_LIMIT,
): Promise<InboxJobRow[]> {
  const supabase = getNotificationServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("notification_jobs")
    .select("id, category, title, body, path, created_at, scheduled_for")
    .eq("recipient_user_id", recipientUserId)
    .neq("status", INELIGIBLE_INBOX_STATUS)
    .lte("scheduled_for", nowIso)
    .gt("scheduled_for", clearedBefore)
    .order("scheduled_for", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    category: row.category as string,
    title: row.title as string,
    body: row.body as string,
    path: row.path as string,
    createdAt: row.created_at as string,
    scheduledFor: row.scheduled_for as string,
  }));
}

/** Every job id, among `jobIds`, this user has already marked read. A single `.in()` query regardless of how many ids are passed -- never one query per job. */
export async function getReadJobIds(userId: string, jobIds: readonly string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("notification_reads")
    .select("job_id")
    .eq("user_id", userId)
    .in("job_id", jobIds);
  if (error) throw error;
  return new Set(((data ?? []) as { job_id: string }[]).map((row) => row.job_id));
}

/**
 * Whether `jobId` is a real, inbox-eligible job (not `cancelled`, same
 * eligibility rule `getInboxJobsForRecipient` applies) whose
 * `recipient_user_id` is `userId` -- the ONE ownership check
 * `markNotificationReadAction` must run before ever writing a
 * `notification_reads` row. `jobId` is always client-supplied (the item
 * the user clicked); the service-role client bypasses RLS entirely, so
 * without this explicit check a caller could otherwise write a read-state
 * row for a job that was never addressed to them. `false` covers both
 * "no such job" and "exists but belongs to someone else / is cancelled"
 * identically -- the caller never needs to (and, by design, cannot)
 * distinguish the two.
 */
export async function isEligibleInboxJobForRecipient(userId: string, jobId: string): Promise<boolean> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("notification_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("recipient_user_id", userId)
    .neq("status", INELIGIBLE_INBOX_STATUS)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Marks one job read for this user -- idempotent (`ignoreDuplicates`), never errors on an already-read job. Never touches `notification_jobs` itself. Callers MUST verify ownership first (`isEligibleInboxJobForRecipient`) -- this function itself trusts `jobId` as already-proven, so it never re-checks. */
export async function markNotificationJobRead(userId: string, jobId: string): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error } = await supabase
    .from("notification_reads")
    .upsert({ user_id: userId, job_id: jobId }, { onConflict: "user_id,job_id", ignoreDuplicates: true });
  if (error) throw error;
}

/** Marks every one of `jobIds` read for this user in ONE upsert -- never one query per job (avoids N+1 for "סמן הכל כנקרא"). A job already marked read is left untouched (`ignoreDuplicates`). */
export async function markNotificationJobsRead(userId: string, jobIds: readonly string[]): Promise<void> {
  if (jobIds.length === 0) return;
  const supabase = getNotificationServiceClient();
  const rows = jobIds.map((jobId) => ({ user_id: userId, job_id: jobId }));
  const { error } = await supabase
    .from("notification_reads")
    .upsert(rows, { onConflict: "user_id,job_id", ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * "נקה התראות" -- advances this user's inbox cutoff to now, so every
 * currently-visible job stops appearing. Idempotent by construction
 * (upserting a later `cleared_before` is always safe to repeat) and
 * never deletes/updates a single `notification_jobs` row -- the
 * technical outbox history this cutoff hides is still fully intact for
 * the worker and for any future audit.
 */
export async function clearNotificationInbox(userId: string): Promise<void> {
  const supabase = getNotificationServiceClient();
  const { error } = await supabase
    .from("notification_inbox_state")
    .upsert(
      { user_id: userId, cleared_before: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
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

// ---------------------------------------------------------------------------
// Manager manual broadcast batches -- audit + idempotency ONLY. Per-recipient
// delivery state stays entirely owned by `notification_jobs`/
// `notification_deliveries` above; this table never duplicates it (see
// `lib/notifications/engine/manualBroadcast.ts`, the one caller).
// ---------------------------------------------------------------------------

export type BroadcastAudienceKind = "person" | "people" | "everyone";

export interface NewManagerNotificationBatch {
  idempotencyKey: string;
  createdByPersonId: string;
  createdByPersonName: string;
  audienceKind: BroadcastAudienceKind;
  targetPersonIds: readonly string[];
  /** The EXACT set of resolved Supabase auth user ids this batch's jobs were (or are about to be) created for -- the batch's own immutability anchor. See the migration's own doc comment. */
  resolvedRecipientUserIds: readonly string[];
  title: string;
  body: string;
  resolvedRecipientCount: number;
  pushCapableCount: number;
  inboxOnlyCount: number;
  unresolvedCount: number;
}

export interface ManagerNotificationBatchRow {
  id: string;
  idempotencyKey: string;
  createdByPersonId: string;
  createdByPersonName: string;
  audienceKind: BroadcastAudienceKind;
  targetPersonIds: string[];
  resolvedRecipientUserIds: string[];
  title: string;
  body: string;
  resolvedRecipientCount: number;
  pushCapableCount: number;
  inboxOnlyCount: number;
  unresolvedCount: number;
  createdAt: string;
}

const MANAGER_NOTIFICATION_BATCH_COLUMNS =
  "id, idempotency_key, created_by_person_id, created_by_person_name, audience_kind, target_person_ids, resolved_recipient_user_ids, title, body, resolved_recipient_count, push_capable_count, inbox_only_count, unresolved_count, created_at";

function toBatchRow(row: Record<string, unknown>): ManagerNotificationBatchRow {
  return {
    id: row.id as string,
    idempotencyKey: row.idempotency_key as string,
    createdByPersonId: row.created_by_person_id as string,
    createdByPersonName: row.created_by_person_name as string,
    audienceKind: row.audience_kind as BroadcastAudienceKind,
    targetPersonIds: (row.target_person_ids as string[] | null) ?? [],
    resolvedRecipientUserIds: (row.resolved_recipient_user_ids as string[] | null) ?? [],
    title: row.title as string,
    body: row.body as string,
    resolvedRecipientCount: row.resolved_recipient_count as number,
    pushCapableCount: row.push_capable_count as number,
    inboxOnlyCount: row.inbox_only_count as number,
    unresolvedCount: row.unresolved_count as number,
    createdAt: row.created_at as string,
  };
}

export async function getManagerNotificationBatchByIdempotencyKey(
  idempotencyKey: string,
): Promise<ManagerNotificationBatchRow | null> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("manager_notification_batches")
    .select(MANAGER_NOTIFICATION_BATCH_COLUMNS)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data ? toBatchRow(data as Record<string, unknown>) : null;
}

export interface ManagerNotificationBatchUpsertResult {
  row: ManagerNotificationBatchRow;
  /** `true` only when THIS call genuinely inserted the row. `false` means `idempotency_key` already existed -- `row` is the ORIGINAL stored batch, never overwritten by this call's (possibly different) payload. The caller MUST compare `row` against its own current request before creating any jobs -- see `manualBroadcast.ts`'s `isSameLogicalBroadcastRequest`; this function itself does not decide whether a reused key represents a legitimate replay or a mutated request. */
  created: boolean;
}

/**
 * Idempotent by `idempotency_key` -- a genuinely new batch inserts and
 * returns its own fresh row with `created: true`. A retried/double-
 * submitted composer click carrying the SAME key hits the unique
 * constraint and this returns the ALREADY-EXISTING batch row instead
 * (`created: false`, the row's ORIGINAL stored values, never silently
 * overwritten by a second, possibly-different payload).
 */
export async function insertManagerNotificationBatchIfAbsent(
  batch: NewManagerNotificationBatch,
): Promise<ManagerNotificationBatchUpsertResult> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("manager_notification_batches")
    .insert({
      idempotency_key: batch.idempotencyKey,
      created_by_person_id: batch.createdByPersonId,
      created_by_person_name: batch.createdByPersonName,
      audience_kind: batch.audienceKind,
      target_person_ids: batch.targetPersonIds,
      resolved_recipient_user_ids: batch.resolvedRecipientUserIds,
      title: batch.title,
      body: batch.body,
      resolved_recipient_count: batch.resolvedRecipientCount,
      push_capable_count: batch.pushCapableCount,
      inbox_only_count: batch.inboxOnlyCount,
      unresolved_count: batch.unresolvedCount,
    })
    .select(MANAGER_NOTIFICATION_BATCH_COLUMNS)
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const existing = await getManagerNotificationBatchByIdempotencyKey(batch.idempotencyKey);
      if (existing) return { row: existing, created: false };
    }
    throw error;
  }
  return { row: toBatchRow(data as Record<string, unknown>), created: true };
}

/** A bounded recent-history read for the composer's own small audit list -- never a full archive. */
export const RECENT_MANAGER_BROADCASTS_LIMIT = 10;

export async function listRecentManagerNotificationBatches(
  limit: number = RECENT_MANAGER_BROADCASTS_LIMIT,
): Promise<ManagerNotificationBatchRow[]> {
  const supabase = getNotificationServiceClient();
  const { data, error } = await supabase
    .from("manager_notification_batches")
    .select(MANAGER_NOTIFICATION_BATCH_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toBatchRow);
}
