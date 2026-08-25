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

export interface InsertApprovedCompletionInput {
  personId: string;
  performedOn: string;
  source: Extract<CompletionSource, "planned_range_confirmation" | "manager_manual">;
  submittedByPersonId: string;
  submittedByPersonName: string;
  approvedByPersonId: string;
  approvedByPersonName: string;
  linkedPlannedDate: string | null;
}

/** A completion that is ALREADY approved at creation time -- a manager bulk-confirming a planned occurrence, or recording a completion directly. Never used for a self-report (see `insertSelfReport`, always 'pending'). */
export async function insertApprovedCompletion(input: InsertApprovedCompletionInput): Promise<CompletionRow> {
  const supabase = getShootingRangesServiceClient();
  const { data, error } = await supabase
    .from("shooting_range_completions")
    .insert({
      person_id: input.personId,
      performed_on: input.performedOn,
      source: input.source,
      status: "approved",
      submitted_by_person_id: input.submittedByPersonId,
      submitted_by_person_name: input.submittedByPersonName,
      approved_by_person_id: input.approvedByPersonId,
      approved_by_person_name: input.approvedByPersonName,
      approved_at: new Date().toISOString(),
      linked_planned_date: input.linkedPlannedDate,
    })
    .select(COMPLETION_COLUMNS)
    .single();
  if (error) throw error;

  return fromCompletionDbRow(data as CompletionDbRow);
}

/** A rejected planned-range occurrence, recorded for history/traceability alongside its `shooting_range_planned_occurrences` row -- never a baseline candidate. */
export async function insertRejectedPlannedCompletion(input: {
  personId: string;
  performedOn: string;
  submittedByPersonId: string;
  submittedByPersonName: string;
  approvedByPersonId: string;
  approvedByPersonName: string;
}): Promise<CompletionRow> {
  const supabase = getShootingRangesServiceClient();
  const { data, error } = await supabase
    .from("shooting_range_completions")
    .insert({
      person_id: input.personId,
      performed_on: input.performedOn,
      source: "planned_range_confirmation",
      status: "rejected",
      submitted_by_person_id: input.submittedByPersonId,
      submitted_by_person_name: input.submittedByPersonName,
      approved_by_person_id: input.approvedByPersonId,
      approved_by_person_name: input.approvedByPersonName,
      approved_at: new Date().toISOString(),
      linked_planned_date: input.performedOn,
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

/**
 * Resolves every STILL-'planned' occurrence for `rangeDate`: `confirmedPersonIds`
 * become 'confirmed', everyone else still 'planned' for that date becomes
 * 'not_completed' -- so a person the caller's roster snapshot no longer
 * even lists is still correctly resolved (never left dangling in
 * 'planned'). Already-resolved rows ('confirmed'/'not_completed' from an
 * earlier action) are never touched again -- the `.eq("status","planned")`
 * guard on both updates is load-bearing, exactly like `resolveSelfReport`'s.
 */
export async function resolvePlannedOccurrencesForDate(
  rangeDate: string,
  confirmedPersonIds: readonly string[],
  resolvedByPersonId: string,
  resolvedByPersonName: string,
): Promise<PlannedOccurrenceRow[]> {
  const supabase = getShootingRangesServiceClient();
  const resolvedAt = new Date().toISOString();

  if (confirmedPersonIds.length > 0) {
    const { error } = await supabase
      .from("shooting_range_planned_occurrences")
      .update({
        status: "confirmed",
        resolved_by_person_id: resolvedByPersonId,
        resolved_by_person_name: resolvedByPersonName,
        resolved_at: resolvedAt,
      })
      .eq("range_date", rangeDate)
      .eq("status", "planned")
      .in("person_id", confirmedPersonIds);
    if (error) throw error;
  }

  const { error: rejectError } = await supabase
    .from("shooting_range_planned_occurrences")
    .update({
      status: "not_completed",
      resolved_by_person_id: resolvedByPersonId,
      resolved_by_person_name: resolvedByPersonName,
      resolved_at: resolvedAt,
    })
    .eq("range_date", rangeDate)
    .eq("status", "planned");
  if (rejectError) throw rejectError;

  return getPlannedOccurrencesByDate(rangeDate);
}
