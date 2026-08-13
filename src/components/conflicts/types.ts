import type { IssueSeverity } from "@/lib/domain/operationalIssues";

/**
 * Presentation-ready view of one `PersonalIssue`, fully precomputed
 * server-side. `key` is derived from the issue's position in the
 * already-deterministically-ordered `model.issues` array -- never from
 * date/reason/title alone, so two distinct issues sharing those never
 * collapse into one React key.
 */
export interface ConflictIssueView {
  key: string;
  severity: IssueSeverity;
  reasonLabel: string;
  dateLabel: string;
  targetEmoji: string | null;
  /** Null only when `PersonalIssue.targetEvent` itself is null -- never invented. */
  targetTitle: string | null;
  /** Already-formatted "HH:mm–HH:mm" ranges, in the domain's own order. Null unless the issue is a coverage issue with real gaps. */
  missingIntervalLabels: string[] | null;
  /** Longer explanatory copy for reasons that need it (blocking absence, invalid time, role mismatch). Null otherwise. */
  explanation: string | null;
  guidance: string;
}
