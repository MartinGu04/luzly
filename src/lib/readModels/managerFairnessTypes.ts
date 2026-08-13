import type { DutyFamily } from "@/lib/domain/event";
import type { FairnessPeriodKey } from "@/lib/domain/fairnessPeriod";
import type { LocalNow } from "@/lib/domain/localNow";

export interface ManagerFairnessPeriodView {
  key: FairnessPeriodKey;
  /** "1–6/2026" / "7–12/2026" -- already period+year formatted, ready to render. */
  label: string;
}

/** Manager-safe projection of `FairnessExemption` -- same shape, re-exported at the read-model boundary so components never import `lib/domain` types directly. */
export interface ManagerFairnessExemptionView {
  raw: string;
  affectedDutyFamilies: readonly DutyFamily[];
}

/**
 * One fairness row, fully analyzed and manager-safe (PR #15 §8/§45/§46):
 * no email, no `sourceSheet`/`sourceCell`, no raw Google row. `personId` is
 * `null` for an unresolved/historical source name -- the row still
 * displays, it just isn't linkable to a drill-down.
 */
export interface ManagerFairnessPersonRowView {
  key: string;
  sourceName: string;
  personId: string | null;
  allocationLabel: string;
  previousScore: number | null;
  currentScore: number | null;
  /** currentScore - previousScore; `null` when there's no previous score to compare against (never treated as 0). */
  delta: number | null;
  /** "יעד השוואה" -- reference only, never a hard limit. `null` when no deterministic target applies. */
  comparisonTarget: number | null;
  /** "פער מהיעד" -- currentScore - comparisonTarget. */
  gapToTarget: number | null;
  /** currentScore / comparisonTarget -- lets roles with different target scales compare fairly. */
  normalizedLoad: number | null;
  weekendCount: number | null;
  exemptions: readonly ManagerFairnessExemptionView[];
}

export interface ManagerFairnessTargetsView {
  supervisorTarget: number | null;
  technicianTarget: number | null;
}

export interface ManagerFairnessTotalsView {
  reportedPreviousTotal: number | null;
  reportedCurrentTotal: number | null;
  reportedWeekendTotal: number | null;
  computedPreviousTotal: number;
  computedCurrentTotal: number;
  computedWeekendTotal: number;
  /** True when any reported total differs from the independently computed sum beyond decimal tolerance -- manager-only informational warning, never a sheet "fix". */
  hasDiscrepancy: boolean;
}

/** The ONLY shape the chart's tiny client component may ever receive (PR #15 §28) -- never the full read model, never raw sheet cells. */
export interface ManagerFairnessChartSlice {
  id: string;
  name: string;
  score: number;
  percentage: number;
}

/**
 * The manager-only Fairness read model (PR #15 §5) -- a SEPARATE domain
 * from `ManagerOverviewReadModel`. Fairness and Potential reconciliation
 * happen to live on the same sheet tabs but are never merged into one
 * giant read model. Never carries email, `sourceSheet`/`sourceCell`, raw
 * Google rows, or the spreadsheet id (PR #15 §45).
 */
export interface ManagerFairnessReadModel {
  manager: { id: string; name: string };
  fetchedAt: string;
  localNow: LocalNow;
  period: ManagerFairnessPeriodView;
  targets: ManagerFairnessTargetsView;
  /** Deterministically sorted by relative load (PR #15 §31) -- never labeled "next up". */
  rows: readonly ManagerFairnessPersonRowView[];
  /** `null` when the sheet has no "סך הכל:" row to compare against. */
  totals: ManagerFairnessTotalsView | null;
  /** Only rows with a known `currentScore`; empty when the total is zero/unavailable (PR #15 §27/§29). */
  chartSlices: readonly ManagerFairnessChartSlice[];
  /** Set only when it resolves to a row with a known `personId` in THIS period's rows -- an unknown/invalid id falls back to `null` (everyone). */
  selectedPersonId: string | null;
}
