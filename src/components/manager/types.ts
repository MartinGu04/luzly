import type { AbsenceKind, DutyFamily } from "@/lib/domain/event";
import type { ManagerRequirementStatus } from "@/lib/domain/potentialReconciliation";
import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import type { IssueRowView } from "@/components/issues/types";

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

/**
 * One entry in the manager's unified "דורש טיפול" list -- either a real
 * operational issue (conflict or coverage gap, from `detectOperationalIssues`)
 * or a Potential-vs-internal staffing problem (from
 * `reconcilePotentialAllocations`), tagged only so `ManagerAttentionSection`
 * knows which row component to render. The manager never sees this `kind`
 * distinction itself -- both render as plain rows under the same "דחוף"/
 * "לבדיקה" severity groupings, never under separate per-engine headings.
 */
export type ManagerAttentionItem =
  | { kind: "issue"; view: IssueRowView }
  | { kind: "potential"; view: ManagerPotentialRowView };

/**
 * Explicit per-role coverage diagnostic view -- `message` is null only when
 * `status === "full"` (the group's own name list already shows who covers
 * it); otherwise it's an already-formatted "חסר טכנאי" / "כיסוי אחמ״ש חלקי
 * · 05:30–07:30" / "לא ניתן להעריך כיסוי טכנאי" string, never derived by
 * the component from an empty name list.
 */
export interface ManagerRoleCoverageRowView {
  status: CoverageStatus;
  message: string | null;
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
  technicianCoverage: ManagerRoleCoverageRowView;
  supervisorCoverage: ManagerRoleCoverageRowView;
}

/**
 * One date's day+night shift picture, paired -- the Shifts category's
 * compact "understand the period as a whole" grid (redesign), one card per
 * date instead of one full-width card per date+period. Mirrors the SAME
 * day/night pairing `ScheduleEveryoneDayView` already establishes for the
 * manager-only Schedule "כולם" perspective (`lib/presentation/scheduleEveryone.ts`)
 * -- a "morning"/"unspecified" shift period intentionally never surfaces
 * here either, same reasoning. `null` means no shift Events at all for
 * that date+period, never a fabricated "missing" verdict.
 */
export interface ManagerShiftDayView {
  key: string;
  /** Raw "YYYY-MM-DD", kept for building a `/schedule?person=all&date=...` deep link -- `dateLabel` alone isn't reversible. */
  date: string;
  dateLabel: string;
  day: ManagerShiftGroupView | null;
  night: ManagerShiftGroupView | null;
}

/** Presentation-ready view of one `ManagerDutyEntry`. `dutyFamily` is carried through (a typed domain enum, not raw sheet text) so the section can group by it -- same family, different slots, group together (Design Pass PR #21 §15). */
export interface ManagerDutyRowView {
  key: string;
  personName: string;
  dateLabel: string;
  emoji: string | null;
  title: string;
  dutyFamily: DutyFamily;
}

/** Presentation-ready view of one `ManagerAbsenceEntry`. `absenceKind` is carried through (a typed domain enum) so the section can group by it (Design Pass PR #21 §16). */
export interface ManagerAbsenceRowView {
  key: string;
  personName: string;
  dateLabel: string;
  emoji: string | null;
  label: string;
  absenceKind: AbsenceKind;
}
