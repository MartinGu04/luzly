import {
  computeGapToTarget,
  computeNormalizedLoad,
  computeScoreDelta,
  resolveComparisonTarget,
  resolveDutyFairnessStatus,
  resolveFairnessAllocationRole,
  sumDisplayedFairnessRows,
} from "@/lib/domain/fairnessAnalysis";
import { resolveFairnessExemptions } from "@/lib/domain/fairnessExemptions";
import {
  fairnessDataCompleteness,
  FAIRNESS_MODEL_VERSION,
  resolveFairnessPeriodStatus,
  type FairnessDataCompletenessReason,
} from "@/lib/domain/fairnessFoundation";
import {
  fairnessPeriodEndDate,
  fairnessPeriodIdentityLabel,
  type FairnessPeriodIdentity,
} from "@/lib/domain/fairnessPeriod";
import type { FairnessPersonRow, FairnessTableParseResult, FairnessTargets } from "@/lib/domain/fairnessTable";
import type { LocalNow } from "@/lib/domain/localNow";
import type {
  DutyFairnessGroupKey,
  DutyFairnessGroupView,
  DutyFairnessPersonRowView,
  DutyFairnessReadModel,
  DutyFairnessTotalsView,
} from "./dutyFairnessTypes";

export interface BuildDutyFairnessReadModelInput {
  parseResult: FairnessTableParseResult;
  /** Which H1/H2 period AND which year -- see `fairnessPeriod.ts`'s own year-safety docs; this builder never guesses a year from `now`. */
  periodIdentity: FairnessPeriodIdentity;
  fetchedAt: string;
  now: LocalNow;
}

/**
 * Pure, deterministic construction of `DutyFairnessReadModel` from an
 * already-parsed `FairnessTableParseResult` -- no network, no auth, no
 * `Date`/UTC, never mutates any input (same convention as
 * `buildManagerFairnessReadModel.ts` and `buildShiftFairnessReadModel.ts`).
 *
 * This PR does NOT recalculate duty scores, does NOT apply Shift Fairness's
 * ±0.5-shift tolerance, and does NOT invent a weighted combined score. The
 * Google Sheet's `currentScore` flows through untouched as the
 * authoritative Duty Fairness score -- every value computed here
 * (delta/target/gap/normalizedLoad/status) is analysis ON TOP of it, never
 * a replacement (PR #15 §10, unchanged).
 *
 * A REAL, UNRESOLVED DOMAIN QUESTION (deliberately left as-is, not guessed):
 * grouping here reuses `resolveFairnessAllocationRole`, the SAME exact-match
 * classifier the existing `lib/presentation/managerFairnessGrouping.ts`
 * already uses for the live manager Fairness page -- only the literal
 * allocation labels 'אחמ"ש'/"טכנאי" resolve to a group; every other label,
 * including the literal text 'ר"צ', falls to `"other"`, exactly like the
 * existing, tested `groupManagerFairnessRows` behavior. A person whose
 * organizational title is ר"צ but who is ALSO capability-flagged
 * `isSupervisor` DOES land in the `"supervisor"` group for Shift Fairness
 * (`fairnessGroups.ts`'s `resolveFairnessComparisonGroupKey`, a genuinely
 * separate, capability-based classifier for a genuinely separate mode) --
 * but nothing in today's verified domain code proves that the DUTY table's
 * own 'ר"צ' ALLOCATION-LABEL text itself should be folded into the
 * supervisor duty population/target-eligible group. Inventing that mapping
 * here would be a new, unverified business rule, so it was deliberately NOT
 * added -- a 'ר"צ'-labeled duty row stays in `"other"`, visible with its
 * real score/exemptions/weekend count, `comparisonTarget: null` (correctly,
 * since `resolveFairnessAllocationRole` doesn't grant it a target either).
 */
export function buildDutyFairnessReadModel(input: BuildDutyFairnessReadModelInput): DutyFairnessReadModel {
  const { parseResult, periodIdentity, fetchedAt, now } = input;
  const { personRows, totals, targets } = parseResult;

  const periodStatus = resolveFairnessPeriodStatus(fairnessPeriodEndDate(periodIdentity), now);

  const rows = personRows.map((row, index) => toRowView(row, targets, index));
  const sortedRows = [...rows].sort(compareDutyFairnessRows);

  return {
    fetchedAt,
    fairnessModelVersion: FAIRNESS_MODEL_VERSION,
    period: {
      key: periodIdentity.key,
      year: periodIdentity.year,
      label: fairnessPeriodIdentityLabel(periodIdentity),
      status: periodStatus,
    },
    targets: { supervisorTarget: targets.supervisorTarget, technicianTarget: targets.technicianTarget },
    groups: buildGroups(sortedRows),
    totals: totals ? toTotalsView(personRows, totals) : null,
  };
}

function toRowView(row: FairnessPersonRow, targets: FairnessTargets, index: number): DutyFairnessPersonRowView {
  const role = resolveFairnessAllocationRole(row.allocationLabel);
  const comparisonTarget = resolveComparisonTarget(row.allocationLabel, targets);
  const currentScore = row.currentScore;

  const reasons: FairnessDataCompletenessReason[] = [];
  if (row.resolvedPersonId === null) reasons.push("duty_identity_unresolved");
  if (role !== null && comparisonTarget === null) reasons.push("duty_target_unavailable");

  return {
    key: `${row.resolvedPersonId ?? "unresolved"}-${index}`,
    personId: row.resolvedPersonId,
    sourceName: row.sourceName,
    allocationLabel: row.allocationLabel,
    previousScore: row.previousScore,
    currentScore,
    delta: computeScoreDelta(row.previousScore, currentScore),
    comparisonTarget,
    gapToTarget: computeGapToTarget(currentScore, comparisonTarget),
    normalizedLoad: computeNormalizedLoad(currentScore, comparisonTarget),
    status: resolveDutyFairnessStatus(currentScore, comparisonTarget),
    weekendCount: row.weekendCount,
    exemptions: resolveFairnessExemptions(row.exemptions),
    dataCompleteness: fairnessDataCompleteness(reasons),
  };
}

function toTotalsView(
  personRows: readonly FairnessPersonRow[],
  totals: NonNullable<FairnessTableParseResult["totals"]>,
): DutyFairnessTotalsView {
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

const GROUP_ORDER: readonly DutyFairnessGroupKey[] = ["supervisor", "technician", "other"];

/**
 * Buckets the ALREADY-sorted rows by `allocationLabel` -- never re-sorts
 * within a bucket, so each group preserves the exact relative order
 * established by `compareDutyFairnessRows` (same convention as
 * `lib/presentation/managerFairnessGrouping.ts`'s own grouping of an
 * already-sorted read model). A group with zero rows is omitted entirely,
 * never rendered as an empty bucket.
 */
function buildGroups(sortedRows: readonly DutyFairnessPersonRowView[]): DutyFairnessGroupView[] {
  const byGroup = new Map<DutyFairnessGroupKey, DutyFairnessPersonRowView[]>();
  for (const row of sortedRows) {
    const key: DutyFairnessGroupKey = resolveFairnessAllocationRole(row.allocationLabel) ?? "other";
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(row);
    else byGroup.set(key, [row]);
  }

  const groups: DutyFairnessGroupView[] = [];
  for (const key of GROUP_ORDER) {
    const rowsForGroup = byGroup.get(key);
    if (!rowsForGroup || rowsForGroup.length === 0) continue;
    groups.push({ key, rows: rowsForGroup });
  }
  return groups;
}

/**
 * Lowest normalized load first, then rows without one (source order via
 * `key`), stable tiebreak by source name then key -- the SAME established
 * ordering `buildManagerFairnessReadModel.ts`'s `compareFairnessRows`
 * already implements (PR #15 §31), preserved here unchanged. Pure
 * relative-load ordering -- never labeled "הבא בתור" / "עדיפות לשיבוץ" by
 * any caller.
 */
function compareDutyFairnessRows(a: DutyFairnessPersonRowView, b: DutyFairnessPersonRowView): number {
  const aHasLoad = a.normalizedLoad !== null;
  const bHasLoad = b.normalizedLoad !== null;

  if (aHasLoad && bHasLoad && a.normalizedLoad !== b.normalizedLoad) {
    return (a.normalizedLoad as number) - (b.normalizedLoad as number);
  }
  if (aHasLoad !== bHasLoad) return aHasLoad ? -1 : 1;

  if (a.sourceName !== b.sourceName) return a.sourceName < b.sourceName ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
