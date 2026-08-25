import {
  classifyQualificationStatus,
  computeQualificationExpiryDate,
  type QualificationStatus,
} from "@/lib/domain/shootingRangeQualification";
import type { CompletionRow, PlannedOccurrenceRow } from "@/lib/shootingRanges/store";
import type { ShootingRangeSheetRecord } from "@/lib/parsers/shootingRanges";

export type QualificationBaselineSource = "app" | "sheet" | null;

export interface ShootingRangeHistoryEntry {
  /** `null` for the synthetic Google Sheet baseline row -- it has no application-owned id. */
  id: string | null;
  performedOn: string;
  source: CompletionRow["source"];
  status: CompletionRow["status"];
  approvedByPersonName: string | null;
  notes: string | null;
}

export type PlannedRangeDisplayStatus = "planned" | "pending_confirmation";

export interface PlannedRangeView {
  rangeDate: string;
  status: PlannedRangeDisplayStatus;
}

export interface PendingSelfReportView {
  id: string;
  performedOn: string;
  notes: string | null;
  createdAt: string;
}

export interface ShootingRangeQualificationReadModel {
  personId: string;
  baselineDate: string | null;
  baselineSource: QualificationBaselineSource;
  expiryDate: string | null;
  status: QualificationStatus;
  plannedRange: PlannedRangeView | null;
  pendingSelfReport: PendingSelfReportView | null;
  history: ShootingRangeHistoryEntry[];
}

export interface BuildShootingRangeQualificationReadModelInput {
  personId: string;
  /** This person's own most recent Google Sheet מטווחים row whose `performedOn` is today or earlier (a genuinely past completion) -- a future-dated row is never passed here, see the orchestration loader's own split. `null` when the sheet has no such row for this person. */
  sheetBaseline: ShootingRangeSheetRecord | null;
  /** Every completion CLAIM for this person, any status -- source precedence and history are both derived from this single set, never a second query. */
  completions: readonly CompletionRow[];
  /** Every planned occurrence for this person, any status. */
  plannedOccurrences: readonly PlannedOccurrenceRow[];
  /** "YYYY-MM-DD", Asia/Jerusalem civil date -- no `Date`/UTC in this pure builder (same convention as every other `build*ReadModel`). */
  today: string;
}

/**
 * Pure qualification read model: no network, no auth, no `Date`/UTC --
 * same purity contract as `buildPersonalScheduleReadModel.ts`/
 * `buildManagerOverviewReadModel.ts`. Implements the feature's explicit
 * source precedence (spec):
 *
 *   1. the latest APPROVED mi-ma-mo completion (by `performedOn`) --
 *      unconditionally wins, regardless of how it compares to the sheet
 *      baseline's own date;
 *   2. otherwise, the Google Sheet initial baseline;
 *   3. otherwise, no qualification data at all (`baselineDate: null`,
 *      never a fabricated expiry).
 *
 * A `pending`/`rejected` completion is NEVER a baseline candidate, at any
 * point -- only `status === "approved"` rows are ever considered.
 */
export function buildShootingRangeQualificationReadModel(
  input: BuildShootingRangeQualificationReadModelInput,
): ShootingRangeQualificationReadModel {
  const approvedCompletions = input.completions.filter((completion) => completion.status === "approved");
  const latestApproved = approvedCompletions.reduce<CompletionRow | null>((latest, candidate) => {
    if (!latest) return candidate;
    return candidate.performedOn > latest.performedOn ? candidate : latest;
  }, null);

  let baselineDate: string | null = null;
  let baselineSource: QualificationBaselineSource = null;

  if (latestApproved) {
    baselineDate = latestApproved.performedOn;
    baselineSource = "app";
  } else if (input.sheetBaseline) {
    baselineDate = input.sheetBaseline.performedOn;
    baselineSource = "sheet";
  }

  const expiryDate = baselineDate ? computeQualificationExpiryDate(baselineDate) : null;
  const status = classifyQualificationStatus(expiryDate, input.today);

  const plannedRange = selectPlannedRangeView(input.plannedOccurrences, input.today);

  const pendingSelfReports = input.completions
    .filter((completion) => completion.source === "self_report" && completion.status === "pending")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const pendingSelfReport = pendingSelfReports[0]
    ? {
        id: pendingSelfReports[0].id,
        performedOn: pendingSelfReports[0].performedOn,
        notes: pendingSelfReports[0].notes,
        createdAt: pendingSelfReports[0].createdAt,
      }
    : null;

  const history = buildHistory(input.sheetBaseline, input.completions);

  return {
    personId: input.personId,
    baselineDate,
    baselineSource,
    expiryDate,
    status,
    plannedRange,
    pendingSelfReport,
    history,
  };
}

/**
 * The single most relevant unresolved (`status: "planned"`) occurrence to
 * surface: a PAST-due one (needs manager confirmation) takes priority over
 * a future one, since it requires attention; ties broken by the earliest
 * `rangeDate`. A `confirmed`/`not_completed` occurrence is already
 * resolved and never shown here -- its outcome lives in `history` via the
 * `shooting_range_completions` row it produced.
 */
function selectPlannedRangeView(
  occurrences: readonly PlannedOccurrenceRow[],
  today: string,
): PlannedRangeView | null {
  const unresolved = occurrences.filter((occurrence) => occurrence.status === "planned");
  if (unresolved.length === 0) return null;

  // Strictly BEFORE today -- a range dated today has not "finished" yet
  // (spec: "after the planned range calendar date has FINISHED"), so it
  // stays "planned" for the whole of its own calendar day and only
  // becomes "pending confirmation" starting the next civil day.
  const pastDue = unresolved.filter((occurrence) => occurrence.rangeDate < today).sort((a, b) => (a.rangeDate < b.rangeDate ? -1 : 1));
  if (pastDue.length > 0) {
    return { rangeDate: pastDue[0].rangeDate, status: "pending_confirmation" };
  }

  const upcoming = unresolved.filter((occurrence) => occurrence.rangeDate >= today).sort((a, b) => (a.rangeDate < b.rangeDate ? -1 : 1));
  if (upcoming.length === 0) return null;
  return { rangeDate: upcoming[0].rangeDate, status: "planned" };
}

function buildHistory(
  sheetBaseline: ShootingRangeSheetRecord | null,
  completions: readonly CompletionRow[],
): ShootingRangeHistoryEntry[] {
  const entries: ShootingRangeHistoryEntry[] = completions.map((completion) => ({
    id: completion.id,
    performedOn: completion.performedOn,
    source: completion.source,
    status: completion.status,
    approvedByPersonName: completion.approvedByPersonName,
    notes: completion.notes,
  }));

  if (sheetBaseline) {
    entries.push({
      id: null,
      performedOn: sheetBaseline.performedOn,
      source: "sheet_baseline",
      status: "approved",
      approvedByPersonName: null,
      notes: null,
    });
  }

  return entries.sort((a, b) => (a.performedOn < b.performedOn ? 1 : a.performedOn > b.performedOn ? -1 : 0));
}
