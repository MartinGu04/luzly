import "server-only";
import { getShootingRangesServiceClient } from "./serviceClient";

export type CompletionSource = "sheet_baseline" | "self_report" | "planned_range_confirmation" | "manager_manual";
export type CompletionStatus = "pending" | "approved" | "rejected";

export interface CompletionRow {
  id: string;
  personId: string;
  performedOn: string;
  source: CompletionSource;
  status: CompletionStatus;
  notes: string | null;
  submittedByPersonId: string;
  submittedByPersonName: string;
  approvedByPersonId: string | null;
  approvedByPersonName: string | null;
  approvedAt: string | null;
  linkedPlannedDate: string | null;
  createdAt: string;
}

interface CompletionDbRow {
  id: string;
  person_id: string;
  performed_on: string;
  source: CompletionSource;
  status: CompletionStatus;
  notes: string | null;
  submitted_by_person_id: string;
  submitted_by_person_name: string;
  approved_by_person_id: string | null;
  approved_by_person_name: string | null;
  approved_at: string | null;
  linked_planned_date: string | null;
  created_at: string;
}

function fromCompletionDbRow(row: CompletionDbRow): CompletionRow {
  return {
    id: row.id,
    personId: row.person_id,
    performedOn: row.performed_on,
    source: row.source,
    status: row.status,
    notes: row.notes,
    submittedByPersonId: row.submitted_by_person_id,
    submittedByPersonName: row.submitted_by_person_name,
    approvedByPersonId: row.approved_by_person_id,
    approvedByPersonName: row.approved_by_person_name,
    approvedAt: row.approved_at,
    linkedPlannedDate: row.linked_planned_date,
    createdAt: row.created_at,
  };
}

const COMPLETION_COLUMNS =
  "id, person_id, performed_on, source, status, notes, submitted_by_person_id, submitted_by_person_name, approved_by_person_id, approved_by_person_name, approved_at, linked_planned_date, created_at";

/** Every completion CLAIM (any status) for the given people -- the read model itself decides baseline precedence (most recent APPROVED row) and history presentation from this full set. Empty input never round-trips to the DB. */
export async function getCompletionsForPersonIds(personIds: readonly string[]): Promise<CompletionRow[]> {
  if (personIds.length === 0) return [];

  const supabase = getShootingRangesServiceClient();
  const { data, error } = await supabase
    .from("shooting_range_completions")
    .select(COMPLETION_COLUMNS)
    .in("person_id", personIds)
    .order("performed_on", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as CompletionDbRow[]).map(fromCompletionDbRow);
}

export interface InsertSelfReportInput {
  personId: string;
  performedOn: string;
  notes: string | null;
  submittedByPersonId: string;
  submittedByPersonName: string;
}

/** "ביצעתי מטווח" -- always inserted as `status: 'pending'`. Never renews the baseline by itself; only a later manager approval can. */
export async function insertSelfReport(input: InsertSelfReportInput): Promise<CompletionRow> {
  const supabase = getShootingRangesServiceClient();
  const { data, error } = await supabase
    .from("shooting_range_completions")
    .insert({
      person_id: input.personId,
      performed_on: input.performedOn,
      source: "self_report",
      status: "pending",
      notes: input.notes,
      submitted_by_person_id: input.submittedByPersonId,
      submitted_by_person_name: input.submittedByPersonName,
    })
    .select(COMPLETION_COLUMNS)
    .single();
  if (error) throw error;

  return fromCompletionDbRow(data as CompletionDbRow);
}

/**
 * Resolves ONE pending self-report -- guarded by `status = 'pending'` in
 * the WHERE clause of a genuine UPDATE (not an upsert -- see
 * `notifications/engine/store.ts`'s `upsertPendingReminderJob` docstring
 * for why that distinction matters; a plain `.update().eq()` chain DOES
 * apply its filters, unlike an upsert's `ON CONFLICT DO UPDATE`). Returns
 * `null` when the report was not found or already resolved -- the caller
 * must never treat that as success.
 */
export async function resolveSelfReport(
  id: string,
  status: Extract<CompletionStatus, "approved" | "rejected">,
  approvedByPersonId: string,
  approvedByPersonName: string,
): Promise<CompletionRow | null> {
  const supabase = getShootingRangesServiceClient();
  const { data, error } = await supabase
    .from("shooting_range_completions")
    .update({
      status,
      approved_by_person_id: approvedByPersonId,
      approved_by_person_name: approvedByPersonName,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("source", "self_report")
    .eq("status", "pending")
    .select(COMPLETION_COLUMNS)
    .maybeSingle();
  if (error) throw error;

  return data ? fromCompletionDbRow(data as CompletionDbRow) : null;
}

// ---------------------------------------------------------------------------
// Planned occurrences
// ---------------------------------------------------------------------------

export type PlannedOccurrenceStatus = "planned" | "confirmed" | "not_completed";

export interface PlannedOccurrenceRow {
  id: string;
  rangeDate: string;
  personId: string;
  status: PlannedOccurrenceStatus;
  createdByPersonId: string;
  createdByPersonName: string;
  resolvedByPersonId: string | null;
  resolvedByPersonName: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface PlannedOccurrenceDbRow {
  id: string;
  range_date: string;
  person_id: string;
  status: PlannedOccurrenceStatus;
  created_by_person_id: string;
  created_by_person_name: string;
  resolved_by_person_id: string | null;
  resolved_by_person_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

function fromPlannedOccurrenceDbRow(row: PlannedOccurrenceDbRow): PlannedOccurrenceRow {
  return {
    id: row.id,
    rangeDate: row.range_date,
    personId: row.person_id,
    status: row.status,
    createdByPersonId: row.created_by_person_id,
    createdByPersonName: row.created_by_person_name,
    resolvedByPersonId: row.resolved_by_person_id,
    resolvedByPersonName: row.resolved_by_person_name,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

const PLANNED_OCCURRENCE_COLUMNS =
  "id, range_date, person_id, status, created_by_person_id, created_by_person_name, resolved_by_person_id, resolved_by_person_name, resolved_at, created_at";

export async function getPlannedOccurrencesForPersonIds(personIds: readonly string[]): Promise<PlannedOccurrenceRow[]> {
  if (personIds.length === 0) return [];

  const supabase = getShootingRangesServiceClient();
  const { data, error } = await supabase
    .from("shooting_range_planned_occurrences")
    .select(PLANNED_OCCURRENCE_COLUMNS)
    .in("person_id", personIds)
    .order("range_date", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as PlannedOccurrenceDbRow[]).map(fromPlannedOccurrenceDbRow);
}

export async function getPlannedOccurrencesByDate(rangeDate: string): Promise<PlannedOccurrenceRow[]> {
  const supabase = getShootingRangesServiceClient();
  const { data, error } = await supabase
    .from("shooting_range_planned_occurrences")
    .select(PLANNED_OCCURRENCE_COLUMNS)
    .eq("range_date", rangeDate);
  if (error) throw error;

  return ((data ?? []) as PlannedOccurrenceDbRow[]).map(fromPlannedOccurrenceDbRow);
}

/**
 * Schedules `personIds` for `rangeDate` -- idempotent per (range_date,
 * person_id) via `ON CONFLICT DO NOTHING` (`ignoreDuplicates`, never a
 * DO-UPDATE upsert, so re-running this for an already-scheduled person is
 * always a safe no-op, not a silent status reset). Returns the full,
 * current set of occurrences for `rangeDate` after the insert, so the
 * caller (the notification/action layer) always acts on genuinely current
 * state rather than assuming its own input was all newly created.
 */
export async function createPlannedOccurrences(
  rangeDate: string,
  personIds: readonly string[],
  createdByPersonId: string,
  createdByPersonName: string,
): Promise<PlannedOccurrenceRow[]> {
  if (personIds.length === 0) return getPlannedOccurrencesByDate(rangeDate);

  const supabase = getShootingRangesServiceClient();
  const { error } = await supabase
    .from("shooting_range_planned_occurrences")
    .upsert(
      personIds.map((personId) => ({
        range_date: rangeDate,
        person_id: personId,
        status: "planned" as const,
        created_by_person_id: createdByPersonId,
        created_by_person_name: createdByPersonName,
      })),
      { onConflict: "range_date,person_id", ignoreDuplicates: true },
    );
  if (error) throw error;

  return getPlannedOccurrencesByDate(rangeDate);
}

export interface ConfirmShootingRangeOccurrencesResult {
  confirmedPersonIds: string[];
  rejectedPersonIds: string[];
}

interface ConfirmShootingRangeOccurrencesRpcRow {
  person_id: string;
  resolved_status: "confirmed" | "not_completed";
}

/**
 * The ONE call site of the `confirm_shooting_range_occurrences` RPC
 * (`supabase/migrations/20260825130000_add_confirm_shooting_range_occurrences_rpc.sql`)
 * -- atomically resolves every still-`'planned'` occurrence for `rangeDate`
 * (confirmed -> `'confirmed'` + a new approved completion; everyone else
 * still `'planned'` -> `'not_completed'` + a new rejected completion) AND
 * creates the resulting `shooting_range_completions` rows in the SAME
 * database statement.
 *
 * This -- not a separate update-then-insert sequence -- is what makes two
 * concurrent confirmations of the same occurrence safe: see the migration
 * file's own top comment for the exact mechanism (a completion is only
 * ever inserted for a row this call's own update just transitioned, so a
 * losing concurrent call or a client retry affects zero rows and creates
 * zero completions, never a duplicate). The returned sets reflect ONLY
 * what THIS call actually caused -- a person already resolved by an
 * earlier call (or not genuinely `'planned'` for this date at all, e.g. a
 * foreign/stale id) appears in neither set, exactly mirroring what the
 * database did, never the caller's requested input.
 */
export async function confirmShootingRangeOccurrences(
  rangeDate: string,
  confirmedPersonIds: readonly string[],
  resolvedByPersonId: string,
  resolvedByPersonName: string,
): Promise<ConfirmShootingRangeOccurrencesResult> {
  const supabase = getShootingRangesServiceClient();
  const { data, error } = await supabase.rpc("confirm_shooting_range_occurrences", {
    p_range_date: rangeDate,
    p_confirmed_person_ids: [...confirmedPersonIds],
    p_resolver_person_id: resolvedByPersonId,
    p_resolver_person_name: resolvedByPersonName,
  });
  if (error) throw error;

  const rows = (data ?? []) as ConfirmShootingRangeOccurrencesRpcRow[];
  return {
    confirmedPersonIds: rows.filter((row) => row.resolved_status === "confirmed").map((row) => row.person_id),
    rejectedPersonIds: rows.filter((row) => row.resolved_status === "not_completed").map((row) => row.person_id),
  };
}
