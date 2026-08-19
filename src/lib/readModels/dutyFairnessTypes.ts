import type { DutyFamily } from "@/lib/domain/event";
import type { DutyFairnessStatus } from "@/lib/domain/fairnessAnalysis";
import type { FairnessDataCompleteness, FairnessPeriodStatus } from "@/lib/domain/fairnessFoundation";
import type { FairnessPeriodKey } from "@/lib/domain/fairnessPeriod";

/**
 * PR #3 -- the Duty Fairness read model's safe projections. No email, no
 * `sourceSheet`/`sourceCell`, no raw Google row -- same convention as
 * `ShiftFairnessReadModel` (`lib/readModels/shiftFairnessTypes.ts`), which
 * this is a SEPARATE, parallel read model from: Shift Fairness is
 * opportunity-based and month-oriented, Duty Fairness is workbook-score-based
 * and H1/H2-oriented. The two share only the small proven primitives from
 * `lib/domain/fairnessFoundation.ts` (status vocabulary, period status,
 * model version, data completeness) -- never one combined shape.
 *
 * This is a NEW, additional read-model boundary alongside the existing
 * `ManagerFairnessReadModel` (`lib/readModels/managerFairnessTypes.ts`),
 * which stays exactly as it is and keeps powering `/manager/fairness`
 * unchanged. This one exists to make Duty Fairness consumable by the future
 * standalone Fairness page (PR #4) without that page ever touching the
 * manager-only read model or its route.
 */

/**
 * Which duty population a row's `allocationLabel` belongs to --
 * `resolveDutyFairnessGroupKey` (`buildDutyFairnessReadModel.ts`), a
 * DELIBERATELY SEPARATE classifier from the narrower target-eligibility
 * mapping (`resolveFairnessAllocationRole`, `lib/domain/fairnessAnalysis.ts`):
 * 'אחמ"ש' and 'ר"צ' both belong to the `"supervisor"` group (a decided
 * domain rule -- reservist/ר"צ personnel are part of the אחמ"ש population),
 * "טכנאי" belongs to `"technician"`. `"other"` is every other allocation
 * label (e.g. "הסמכה", an unrecognized label) -- metadata/context, never
 * its own comparison group with an invented target. Landing in the
 * `"supervisor"` group does NOT by itself grant a comparison target -- 'ר"צ'
 * still has `comparisonTarget: null`, since only 'אחמ"ש'/"טכנאי" carry a
 * deterministic X/2X target (see `resolveComparisonTarget`, unchanged).
 */
export type DutyFairnessGroupKey = "supervisor" | "technician" | "other";

/** Manager-safe projection of `FairnessExemption` -- same shape, re-exported at this read-model boundary so components never import `lib/domain` types directly (same convention as `ManagerFairnessExemptionView`). */
export interface DutyFairnessExemptionView {
  raw: string;
  affectedDutyFamilies: readonly DutyFamily[];
}

/**
 * One duty Fairness row, safe for presentation. The workbook's own
 * `currentScore` flows through untouched and remains authoritative --
 * `delta`/`comparisonTarget`/`gapToTarget`/`normalizedLoad`/`status` are all
 * analysis ON TOP of it, never a replacement (PR #15's original rule,
 * unchanged by PR #3). `personId` is `null` for an unresolved/ambiguous
 * source name -- the row still displays fully, it just isn't linkable to a
 * drill-down (same convention as `ManagerFairnessPersonRowView`).
 */
export interface DutyFairnessPersonRowView {
  /** Stable within one read model build -- derived from `personId` (or "unresolved") plus source row order, never from a raw sheet cell reference. */
  key: string;
  personId: string | null;
  sourceName: string;
  /** Raw source allocation text (e.g. "טכנאי", 'אחמ"ש', "הסמכה") -- never a basis for inventing a capability. */
  allocationLabel: string;
  previousScore: number | null;
  currentScore: number | null;
  /** currentScore - previousScore; `null` when there's no previous score to compare against (never treated as 0). */
  delta: number | null;
  /** "יעד השוואה" -- reference only, never a hard limit. `null` when no deterministic target applies to this row, OR the period's own target note is missing/malformed (see `dataCompleteness`). */
  comparisonTarget: number | null;
  /** currentScore - comparisonTarget. */
  gapToTarget: number | null;
  /** currentScore / comparisonTarget -- context only, never a global Fairness score. */
  normalizedLoad: number | null;
  /** below/balanced/above, EXACT comparison with no tolerance band -- `null` whenever currentScore or comparisonTarget is unavailable. */
  status: DutyFairnessStatus | null;
  weekendCount: number | null;
  /**
   * Raw, UNWEIGHTED count of duties this person has ACTUALLY COMPLETED in
   * this period, up to and including today -- a DIFFERENT fact from
   * `currentScore` (the workbook's weighted score, where different duty
   * families/weekend duties can contribute different weights). Derived from
   * real schedule Events (`category === "duty"`, confirmed only -- see
   * `lib/domain/fairnessAnalysis.ts`'s `countCompletedDutiesForPerson`),
   * never from the workbook's own score cell. `null` ONLY when `personId`
   * itself is `null` (an unresolved source name has no person to join
   * schedule Events against) -- unlike `comparisonTarget`, this does NOT
   * depend on having a comparison target: a person who "cannot be compared"
   * (no target-bearing allocation label, `status: null`) still gets a real
   * count here whenever their identity is resolved, since it's a plain
   * factual count, not an analysis result.
   */
  completedDutyCount: number | null;
  exemptions: readonly DutyFairnessExemptionView[];
  /** Only ever non-empty for a genuinely verified gap (unresolved identity, or a target-bearing role missing its period target note) -- never noise on every row. */
  dataCompleteness: FairnessDataCompleteness;
  /**
   * The person's presentation-only Google avatar photo, when known --
   * `undefined`/`null` both mean "no photo, fall back to initials", and
   * always `null`/absent when `personId` itself is `null` (an unresolved
   * source name has no person to look a photo up for). Never required by
   * `buildDutyFairnessReadModel` itself (which never sets it --
   * calculations/sorting/eligibility are entirely untouched by this
   * field). Stamped on AFTER the read model is built, by
   * `loadDutyFairnessReadModel` (`dutyFairness.ts`), from
   * `FairnessWorkbookContext.avatarByPersonId`.
   */
  avatarUrl?: string | null;
}

export interface DutyFairnessGroupView {
  key: DutyFairnessGroupKey;
  /** Sorted by the existing established Duty Fairness ordering (lowest normalized load first, unavailable last, stable tie-break) -- never re-sorted into a "priority"/"next up" queue. */
  rows: readonly DutyFairnessPersonRowView[];
}

export interface DutyFairnessTargetsView {
  supervisorTarget: number | null;
  technicianTarget: number | null;
}

/**
 * Two independent facts about the fairness table's totals -- never compared/
 * validated against each other (same convention as `ManagerFairnessTotalsView`;
 * see that type's own docs for why a difference is never a "discrepancy").
 */
export interface DutyFairnessTotalsView {
  reportedPreviousTotal: number | null;
  reportedCurrentTotal: number | null;
  reportedWeekendTotal: number | null;
  displayedPreviousSum: number;
  displayedCurrentSum: number;
  displayedWeekendSum: number;
}

export interface DutyFairnessPeriodView {
  key: FairnessPeriodKey;
  year: number;
  /** "1–6/2026" / "7–12/2026" -- already period+year formatted, ready to render. */
  label: string;
  /** Whether THIS specific H1/H2 period is still in progress or already over, via the shared `fairnessFoundation.ts` foundation -- never a separately duplicated current/closed computation. */
  status: FairnessPeriodStatus;
}

/**
 * The Duty Fairness read model (PR #3) -- workbook-score-based, H1/H2
 * periods. Never carries email, `sourceSheet`/`sourceCell`, raw Google rows,
 * or the spreadsheet id.
 */
export interface DutyFairnessReadModel {
  fetchedAt: string;
  /** `FAIRNESS_MODEL_VERSION` at build time -- carried for a future historical snapshot (PR #5) to know which rules produced it; no snapshot storage exists yet. */
  fairnessModelVersion: number;
  period: DutyFairnessPeriodView;
  targets: DutyFairnessTargetsView;
  /** Supervisor, then technician, then other -- omitted entirely when empty, never rendered as an empty bucket. */
  groups: readonly DutyFairnessGroupView[];
  /** `null` when the sheet has no "סך הכל:" row to compare against. */
  totals: DutyFairnessTotalsView | null;
}
