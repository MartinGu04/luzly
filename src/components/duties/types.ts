import type { DutyBlockProgress, DutyPendingSummary } from "@/lib/presentation/duty";

/**
 * Presentation-safe view of one `PersonalDutyBlock`, fully precomputed
 * server-side. Components render this directly -- never a raw
 * `PersonalDutyBlock`/`PersonalDutyAction` pair -- so no component needs
 * to re-derive matching/pending/progress logic itself.
 */
export interface DutyBlockView {
  key: string;
  emoji: string | null;
  title: string;
  dateRangeLabel: string | null;
  dayCountLabel: string | null;
  certaintyLabel: string | null;
  weekendPartialWarning: boolean;
  isActive: boolean;
  progress: DutyBlockProgress | null;
  pending: DutyPendingSummary | null;
}
