import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import type { PersonalCounterpart } from "@/lib/readModels/types";

/**
 * Presentation-ready view of one `PersonalShiftContext`, fully precomputed
 * server-side. `primaryCounterparts`/`shadowCounterparts` are passed
 * through as-is (already a safe, presentation-ready read-model type --
 * nothing further to derive), never re-fetched or re-filtered here.
 */
export interface ShiftContextView {
  key: string;
  emoji: string | null;
  title: string;
  dateLabel: string;
  /** Only ever set on an emphasized/focused card -- never on every row. */
  hebrewCalendarLabel: string | null;
  coverageStatus: CoverageStatus;
  /** Already-formatted "HH:mm–HH:mm" ranges, in the domain's own order. Empty unless coverage is partial/missing. */
  missingIntervalLabels: string[];
  primaryCounterparts: PersonalCounterpart[];
  shadowCounterparts: PersonalCounterpart[];
  /** Set only when both counterpart lists are empty -- contextual to coverageStatus. */
  emptyCounterpartMessage: string | null;
}
