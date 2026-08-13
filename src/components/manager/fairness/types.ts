/** Presentation-ready view of one `ManagerFairnessPersonRowView` row -- pre-formatted strings only, same convention as `components/manager/types.ts`. */
export interface ManagerFairnessRowCardView {
  key: string;
  sourceName: string;
  /** Set only for a resolved person -- an unresolved historical row stays table-only, never a fake id (PR #15 §32). */
  href: string | null;
  allocationLabel: string;
  previousLabel: string;
  currentLabel: string;
  deltaLabel: string;
  isDeltaNew: boolean;
  targetLabel: string | null;
  gapLabel: string | null;
  weekendLabel: string;
  exemptionBadges: string[];
}
