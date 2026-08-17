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
 * GROUPING AND TARGET ELIGIBILITY ARE DELIBERATELY TWO SEPARATE
 * CLASSIFIERS, not one. Presentation grouping (`resolveDutyFairnessGroupKey`,
 * below) is a decided domain rule: 'ר"צ' is part of the supervisor duty
 * population, alongside 'אחמ"ש'. Target eligibility
 * (`resolveFairnessAllocationRole`/`resolveComparisonTarget`,
 * `fairnessAnalysis.ts`, UNCHANGED) stays the narrower, proven mapping --
 * only 'אחמ"ש' and "טכנאי" carry a deterministic X/2X target. 'ר"צ'
 * therefore lands in the `"supervisor"` GROUP with a real, visible score,
 * but `comparisonTarget`/`gapToTarget`/`normalizedLoad`/`status` stay
 * `null` for it, exactly as they would for any other non-target-bearing
 * label -- landing in a group never by itself grants a target.
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
 * Duty Fairness PRESENTATION grouping -- a decided domain rule, and a
 * DELIBERATELY SEPARATE classifier from `resolveFairnessAllocationRole`'s
 * target-eligibility mapping (`fairnessAnalysis.ts`, unchanged): 'ר"צ' is
 * part of the supervisor duty population, same as 'אחמ"ש', but it is NOT
 * one of the two labels that carries a deterministic X/2X target, so it
 * must not be classified with the SAME function used to decide target
 * eligibility (that would silently grant it a target it was never proven
 * to have). Every other unrecognized/non-target-bearing label (הסמכה,
 * משתחרר, ...) falls to `"other"`, same as before.
 */
const DUTY_GROUP_BY_LABEL: Readonly<Record<string, DutyFairnessGroupKey>> = {
  'אחמ"ש': "supervisor",
  'ר"צ': "supervisor",
  טכנאי: "technician",
};

function resolveDutyFairnessGroupKey(allocationLabel: string): DutyFairnessGroupKey {
  return DUTY_GROUP_BY_LABEL[allocationLabel] ?? "other";
}

/**
 * Buckets the ALREADY-sorted rows by `resolveDutyFairnessGroupKey` -- never
 * re-sorts within a bucket, so each group preserves the exact relative
 * order established by `compareDutyFairnessRows`. A group with zero rows
 * is omitted entirely, never rendered as an empty bucket.
 */
function buildGroups(sortedRows: readonly DutyFairnessPersonRowView[]): DutyFairnessGroupView[] {
  const byGroup = new Map<DutyFairnessGroupKey, DutyFairnessPersonRowView[]>();
  for (const row of sortedRows) {
    const key = resolveDutyFairnessGroupKey(row.allocationLabel);
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
