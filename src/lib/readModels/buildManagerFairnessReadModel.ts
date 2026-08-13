import {
  computeGapToTarget,
  computeNormalizedLoad,
  computeScoreDelta,
  resolveComparisonTarget,
  sumDisplayedFairnessRows,
} from "@/lib/domain/fairnessAnalysis";
import { resolveFairnessExemptions } from "@/lib/domain/fairnessExemptions";
import { fairnessPeriodLabel, type FairnessPeriodKey } from "@/lib/domain/fairnessPeriod";
import type { FairnessPersonRow, FairnessTableParseResult, FairnessTargets } from "@/lib/domain/fairnessTable";
import type { LocalNow } from "@/lib/domain/localNow";
import type { Person } from "@/lib/domain/types";
import type {
  ManagerFairnessChartSlice,
  ManagerFairnessPersonRowView,
  ManagerFairnessReadModel,
  ManagerFairnessTotalsView,
} from "./managerFairnessTypes";

export interface BuildManagerFairnessReadModelInput {
  /** The authenticated manager -- already verified `isManager === true` by the caller. */
  manager: Person;
  parseResult: FairnessTableParseResult;
  period: FairnessPeriodKey;
  fetchedAt: string;
  now: LocalNow;
  /** Raw, unvalidated -- `null` means "everyone"; validated against the resolved rows below. */
  selectedPersonId: string | null;
}

/**
 * Pure, deterministic construction of `ManagerFairnessReadModel` from an
 * already-parsed `FairnessTableParseResult` -- no network, no auth, no
 * Date/UTC, never mutates any input. The Google Sheet's `currentScore`
 * flows through untouched as the authoritative fairness score (PR #15
 * §10) -- every value this builder computes (delta/target/gap/normalized
 * load) is analysis ON TOP of it, never a replacement. The reported
 * "סך הכל:" total and the independently-computed sum of displayed rows
 * are two separate facts (see `sumDisplayedFairnessRows`) -- this builder
 * never compares them or derives a "discrepancy" conclusion, since the
 * sheet's reported total can legitimately be built from a formula that
 * doesn't equal a naive sum of every displayed row.
 */
export function buildManagerFairnessReadModel(
  input: BuildManagerFairnessReadModelInput,
): ManagerFairnessReadModel {
  const { manager, parseResult, period, fetchedAt, now, selectedPersonId } = input;
  const { personRows, totals, targets } = parseResult;

  const rows = personRows.map((row, index) => toRowView(row, targets, index));
  const sortedRows = [...rows].sort(compareFairnessRows);

  const totalsView = totals ? toTotalsView(personRows, totals) : null;
  const chartSlices = buildChartSlices(rows);

  const resolvedPersonIds = new Set(
    rows.filter((row): row is ManagerFairnessPersonRowView & { personId: string } => row.personId !== null)
      .map((row) => row.personId),
  );
  const resolvedSelectedPersonId =
    selectedPersonId !== null && resolvedPersonIds.has(selectedPersonId) ? selectedPersonId : null;

  return {
    manager: { id: manager.id, name: manager.name },
    fetchedAt,
    localNow: now,
    period: { key: period, label: fairnessPeriodLabel(period, now) },
    targets: { supervisorTarget: targets.supervisorTarget, technicianTarget: targets.technicianTarget },
    rows: sortedRows,
    totals: totalsView,
    chartSlices,
    selectedPersonId: resolvedSelectedPersonId,
  };
}

function toRowView(row: FairnessPersonRow, targets: FairnessTargets, index: number): ManagerFairnessPersonRowView {
  const comparisonTarget = resolveComparisonTarget(row.allocationLabel, targets);
  return {
    key: `${row.sourceCell}-${index}`,
    sourceName: row.sourceName,
    personId: row.resolvedPersonId,
    allocationLabel: row.allocationLabel,
    previousScore: row.previousScore,
    currentScore: row.currentScore,
    delta: computeScoreDelta(row.previousScore, row.currentScore),
    comparisonTarget,
    gapToTarget: computeGapToTarget(row.currentScore, comparisonTarget),
    normalizedLoad: computeNormalizedLoad(row.currentScore, comparisonTarget),
    weekendCount: row.weekendCount,
    exemptions: resolveFairnessExemptions(row.exemptions),
  };
}

function toTotalsView(
  personRows: readonly FairnessPersonRow[],
  totals: NonNullable<FairnessTableParseResult["totals"]>,
): ManagerFairnessTotalsView {
  const displayed = sumDisplayedFairnessRows(personRows);
  return {
    reportedPreviousTotal: totals.reportedPreviousTotal,
    reportedCurrentTotal: totals.reportedCurrentTotal,
    reportedWeekendTotal: totals.reportedWeekendTotal,
    displayedPreviousSum: displayed.displayedPreviousSum,
    displayedCurrentSum: displayed.displayedCurrentSum,
    displayedWeekendSum: displayed.displayedWeekendSum,
  };
}

/**
 * Lowest normalized load first, then rows without one (source order via
 * `key`), stable tiebreak by source name then key (PR #15 §31). This is
 * pure relative-load ordering -- callers must never label the first row
 * "הבא בתור" / "עדיפות לשיבוץ".
 */
function compareFairnessRows(a: ManagerFairnessPersonRowView, b: ManagerFairnessPersonRowView): number {
  const aHasLoad = a.normalizedLoad !== null;
  const bHasLoad = b.normalizedLoad !== null;

  if (aHasLoad && bHasLoad && a.normalizedLoad !== b.normalizedLoad) {
    return (a.normalizedLoad as number) - (b.normalizedLoad as number);
  }
  if (aHasLoad !== bHasLoad) return aHasLoad ? -1 : 1;

  if (a.sourceName !== b.sourceName) return a.sourceName < b.sourceName ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * "חלוקת הניקוד הנוכחי בצוות" slices -- raw `currentScore` distribution
 * only (PR #15 §27), never target-normalized, never a recommendation. Rows
 * with an unknown `currentScore` are excluded; an all-null/all-zero team
 * produces an empty chart rather than dividing by zero.
 */
function buildChartSlices(rows: readonly ManagerFairnessPersonRowView[]): ManagerFairnessChartSlice[] {
  const scored = rows.filter((row): row is ManagerFairnessPersonRowView & { currentScore: number } => row.currentScore !== null);
  const total = scored.reduce((sum, row) => sum + row.currentScore, 0);
  if (total <= 0) return [];

  return scored
    .map((row) => ({
      id: row.personId ?? row.key,
      name: row.sourceName,
      score: row.currentScore,
      percentage: (row.currentScore / total) * 100,
    }))
    .sort((a, b) => b.score - a.score);
}
