import type { FairnessDataCompleteness, FairnessPeriodStatus } from "@/lib/domain/fairnessFoundation";
import type { FairnessComparisonGroupKey } from "@/lib/domain/fairnessGroups";
import type { FairnessShiftStatus } from "@/lib/domain/fairnessShiftEngine";

/**
 * PR #2 -- the shift Fairness read model's safe projections. No email, no
 * `sourceSheet`/`sourceCell`, no raw Google row -- same convention as
 * `ManagerFairnessReadModel` (`lib/readModels/managerFairnessTypes.ts`),
 * which this is a SEPARATE, parallel read model from (shift Fairness and
 * duty Fairness are two different modes, never combined in this PR).
 */
export interface ShiftFairnessPersonRowView {
  personId: string;
  personName: string;
  actualShifts: number;
  target: number;
  deviation: number;
  status: FairnessShiftStatus;
  weekendActualShifts: number;
  weekendTarget: number;
  weekendDeviation: number;
  weekendStatus: FairnessShiftStatus;
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
