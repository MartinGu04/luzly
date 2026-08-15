import type { IssueSeverity } from "@/lib/domain/operationalIssues";

/**
 * Presentation-ready view of one operational issue -- the single shared
 * shape for both a person's own issues (dashboard/manager drill-down,
 * `personName` omitted) and the manager's everyone-wide view (`personName`
 * set, since a finding there belongs to someone other than the viewer).
 * Replaces the former separate `ConflictIssueView`/`ManagerIssueRowView`
 * types, which differed only in that one field.
 *
 * `recommendation` is optional and, today, always unset -- no
 * recommendation engine exists yet. The field (and `IssueRow`'s collapsed
 * "פעולה מומלצת" disclosure) exist so a future PR can attach one simple,
 * human-reviewed hint per issue without another type/UI migration. The
 * problem itself always renders first; a recommendation, when present,
 * never decides or changes anything on its own.
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
  recommendation?: string | null;
}
