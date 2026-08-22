import type { FairnessDataCompleteness, FairnessPeriodStatus } from "@/lib/domain/fairnessFoundation";
import type { FairnessComparisonGroupKey } from "@/lib/domain/fairnessGroups";
import type { FairnessShiftStatus } from "@/lib/domain/fairnessShiftEngine";
import type { PersonnelServiceCategory } from "@/lib/domain/personnelType";
import type { ShiftExpectationFactors } from "@/lib/domain/shiftExpectationFactors";

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
  /**
   * Existing `classifyPersonnelType` classification (PR #51 follow-up) --
   * carried on the row itself so the UI can build a service-type
   * presentation subgrouping straight from this read model, without the
   * page needing the full `Person[]` roster. Never a new classification
   * source, never fed back into the Fairness comparison (which stays
   * role-based) -- purely a presentation-safe projection of a field the
   * engine's own `people` input already had.
   */
  serviceCategory: PersonnelServiceCategory;
  actualShifts: number;
  target: number | null;
  deviation: number | null;
  status: FairnessShiftStatus | null;
  weekendActualShifts: number;
  weekendTarget: number | null;
  weekendDeviation: number | null;
  weekendStatus: FairnessShiftStatus | null;
  dataCompleteness: FairnessDataCompleteness;
  /**
   * Justice Table redesign -- a small, honest breakdown of real reasons this
   * person's `target` differs from a full-attendance peer's, reusing only
   * already-parsed Event facts (`lib/domain/shiftExpectationFactors.ts`) --
   * never the underlying opportunity-share formula itself. `null` whenever
   * `target` itself is `null` (an evidence-only/unmodelable member has no
   * "expected value" to explain in the first place) -- never computed for
   * those rows.
   */
  expectationFactors: ShiftExpectationFactors | null;
  /**
   * The person's presentation-only Google avatar photo, when known --
   * `undefined`/`null` both mean "no photo, fall back to initials"; never
   * required by `buildShiftFairnessReadModel` itself (which never sets it
   * -- calculations/sorting/eligibility are entirely untouched by this
   * field). Stamped on AFTER the read model is built, by
   * `loadShiftFairnessReadModel` (`shiftFairness.ts`), from
   * `FairnessWorkbookContext.avatarByPersonId`.
   */
  avatarUrl?: string | null;
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
