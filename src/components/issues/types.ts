import type { IssueSeverity } from "@/lib/domain/operationalIssues";
import type { IssueRecommendationView } from "@/lib/presentation/issueRecommendation";

/**
 * Presentation-ready view of one operational issue -- the single shared
 * shape for both a person's own issues (dashboard/manager drill-down,
 * `personName` omitted) and the manager's everyone-wide view (`personName`
 * set, since a finding there belongs to someone other than the viewer).
 * Replaces the former separate `ConflictIssueView`/`ManagerIssueRowView`
 * types, which differed only in that one field.
 *
 * `recommendation` (PR #37) is only ever set on the manager's everyone-wide
 * `shift_coverage_missing`/`shift_coverage_partial` rows -- see
 * `lib/domain/shiftCoverageRecommendation.ts`/`lib/presentation/issueRecommendation.ts`.
 * It never appears on a person's own issues or the manager's selected-person
 * drill-down (those are built from `PersonalIssue`, which carries no such
 * field). The problem itself always renders first; a recommendation, when
 * present, stays a collapsed, secondary disclosure that never decides or
 * changes anything on its own.
 */
export interface IssueRowView {
  key: string;
  personName?: string | null;
  severity: IssueSeverity;
  reasonLabel: string;
  dateLabel: string;
  targetEmoji: string | null;
  targetTitle: string | null;
  missingIntervalLabels: string[] | null;
  explanation: string | null;
  guidance: string;
  recommendation?: IssueRecommendationView | null;
}
