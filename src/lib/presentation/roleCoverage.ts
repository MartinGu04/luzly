import type { ManagerRoleCoverageView } from "@/lib/readModels/managerTypes";
import { formatMissingIntervals } from "./scheduleTime";

export type ManagerRoleCoverageRoleName = "technician" | "supervisor";

const ROLE_DISPLAY_LABEL: Record<ManagerRoleCoverageRoleName, string> = {
  technician: "טכנאי",
  supervisor: 'אחמ"ש',
};

/**
 * The single canonical presentation order for role groups wherever a UI
 * lists/renders BOTH technician and supervisor staffing together --
 * אחמ"ש (supervisor) always before טכנאי (technician). Every screen that
 * shows both role groups for a period (the Schedule "everyone" month grid
 * cell, its selected-day detail panel, and any future one) should build
 * its rendered list/JSX order from this helper rather than hard-coding
 * technician-then-supervisor or supervisor-then-technician locally -- that
 * duplication is exactly how the two existing screens drifted out of sync
 * with each other before this helper existed. Ordering only -- never
 * touches which people are IN each group, their day/night period, or
 * shadow status; a caller's own `supervisors`/`technicians` (or
 * `shadowSupervisorNames`/`shadowTechnicianNames`) values are passed
 * through completely unchanged, just reordered.
 */
export function inRoleDisplayOrder<T>(groups: { supervisors: T; technicians: T }): readonly [supervisors: T, technicians: T] {
  return [groups.supervisors, groups.technicians];
}

/**
 * Explicit per-role coverage message -- "חסר טכנאי" / "חסר אחמ״ש" /
 * "כיסוי טכנאי חלקי · 05:30–07:30", never inferred by the UI from an empty
 * name list (Design Pass PR #21 §13). `full` returns null -- the existing
 * per-role name list already shows who covers it, no extra callout needed.
 * `not_evaluable` stays truthful: never claims a role is missing without
 * domain proof (an ambiguous canonical shift window -- see
 * `analyzeUnitShiftCoverage` / `RoleCoverageDiagnostic`).
 */
export function roleCoverageMessage(role: ManagerRoleCoverageRoleName, diagnostic: ManagerRoleCoverageView): string | null {
  const label = ROLE_DISPLAY_LABEL[role];
  if (diagnostic.status === "full") return null;
  if (diagnostic.status === "missing") return `חסר ${label}`;
  if (diagnostic.status === "not_evaluable") return `לא ניתן להעריך כיסוי ${label}`;
  const intervals = formatMissingIntervals(diagnostic.missingIntervals).join(" · ");
  return `כיסוי ${label} חלקי · ${intervals}`;
}
