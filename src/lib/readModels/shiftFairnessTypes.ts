import type { FairnessDataCompleteness, FairnessPeriodStatus } from "@/lib/domain/fairnessFoundation";
import type { FairnessComparisonGroupKey } from "@/lib/domain/fairnessGroups";
import type { FairnessShiftStatus } from "@/lib/domain/fairnessShiftEngine";

/**
 * PR #2 -- the shift Fairness read model's safe projections. No email, no
 * `sourceSheet`/`sourceCell`, no raw Google row -- same convention as
 * `ManagerFairnessReadModel` (`lib/readModels/managerFairnessTypes.ts`),
 * which this is a SEPARATE, parallel read model from (shift Fairness and
 * duty Fairness are two different modes, never combined in this PR).
 *
 * `target`/`deviation`/`status` (and their weekend counterparts) are `null`
 * ONLY for an evidence-only comparison-group member whose target cannot be
 * modeled from today's data (see `fairnessShiftEngine.ts`'s
 * `ShiftFairnessPersonResult`) -- never a guessed `0`/`"balanced"` standing
 * in for "not computable", same convention `lib/domain/fairnessAnalysis.ts`
 * already established for the duty Fairness table's own score delta/gap.
 */
export interface ShiftFairnessPersonRowView {
  personId: string;
  personName: string;
  actualShifts: number;
  target: number | null;
  deviation: number | null;
  status: FairnessShiftStatus | null;
  weekendActualShifts: number;
  weekendTarget: number | null;
  weekendDeviation: number | null;
  weekendStatus: FairnessShiftStatus | null;
  dataCompleteness: FairnessDataCompleteness;
}

export interface ShiftFairnessGroupView {
  role: FairnessComparisonGroupKey;
  /** Input roster order preserved -- never re-sorted here (that's a future presentation-layer concern, like `buildManagerFairnessReadModel.ts`'s own row ordering). */
  rows: readonly ShiftFairnessPersonRowView[];
}

export interface ShiftFairnessReadModel {
  fetchedAt: string;
  /** "YYYY-MM" -- the resolved calendar month this read model covers. */
  month: string;
  /** `null` only when the requested month has zero evaluable dates yet (a wholly future month). */
  periodStartDate: string | null;
  periodEndDate: string | null;
  periodStatus: FairnessPeriodStatus;
  /** Supervisor group first, then technician -- only ever the two comparison groups PR #48 established (`fairnessGroups.ts`), never an "other" bucket. */
  groups: readonly ShiftFairnessGroupView[];
}
