import type { IssueSeverity } from "@/lib/domain/operationalIssues";
import type { ManagerRequirementStatus } from "@/lib/domain/potentialReconciliation";
import type { CoverageStatus } from "@/lib/domain/shiftCoverage";

/** Presentation-ready view of one `ManagerIssue` -- personName included since, unlike `/conflicts`, this is everyone's issues, not "your own". */
export interface ManagerIssueRowView {
  key: string;
  personName: string;
  severity: IssueSeverity;
  reasonLabel: string;
  dateLabel: string;
  targetEmoji: string | null;
  targetTitle: string | null;
  missingIntervalLabels: string[] | null;
  explanation: string | null;
  guidance: string;
}

/** Presentation-ready view of one `ManagerPotentialRequirementView` row -- "פוטנציאל מול סידור". */
export interface ManagerPotentialRowView {
  key: string;
  dateLabel: string;
  /** "דרישה" -- e.g. "שמירה 2" (dutyFamily + slot, when present). */
  requirementTitle: string;
  /** "מקור" -- the Potential cell's own honest text (a person's name, or an organizational/source label). Never treated as the actual performer. */
  sourceAllocationLabel: string;
  /** "בסידור בפועל" -- every internal person who actually fulfills this requirement; empty when nobody does. */
  actualAssigneeNames: string[];
  status: ManagerRequirementStatus;
  /** Set only when the named SOURCE person has a blocking absence internally the same date -- independent of `status` (PR #14 §10). */
  sourceConflictNote: string | null;
}

/** Presentation-ready view of one `ManagerShiftOverviewEntry` date+period group. */
export interface ManagerShiftGroupView {
  key: string;
  dateLabel: string;
  periodLabel: string;
  emoji: string | null;
  technicianNames: string[];
  supervisorNames: string[];
  shadowTechnicianNames: string[];
  shadowSupervisorNames: string[];
  coverageStatus: CoverageStatus;
  missingIntervalLabels: string[];
}

/** Presentation-ready view of one `ManagerDutyEntry`. */
export interface ManagerDutyRowView {
  key: string;
  personName: string;
  dateLabel: string;
  emoji: string | null;
  title: string;
}

/** Presentation-ready view of one `ManagerAbsenceEntry`. */
export interface ManagerAbsenceRowView {
  key: string;
  personName: string;
  dateLabel: string;
  emoji: string | null;
  label: string;
}
