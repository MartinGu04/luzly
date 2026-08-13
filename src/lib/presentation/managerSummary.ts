import type {
  ManagerAbsenceEntry,
  ManagerDutyEntry,
  ManagerIssue,
  ManagerPotentialRequirementView,
  ManagerShiftOverviewEntry,
} from "@/lib/readModels/managerTypes";

interface ManagerSummaryInput {
  coverageOverview: readonly ManagerShiftOverviewEntry[];
  duties: readonly ManagerDutyEntry[];
  absences: readonly ManagerAbsenceEntry[];
  issues: readonly ManagerIssue[];
  potentialRequirements: readonly ManagerPotentialRequirementView[];
}

/**
 * "12 משמרות · 3 תורנויות · 2 היעדרויות · 1 דחוף · 2 לבדיקה · 1 דרישת
 * Potential חסרה" -- a restrained summary of the selected range, only
 * ever meaningful non-zero counts (PR #14 §21). Never a KPI dashboard,
 * never an invented utilization/fairness metric.
 */
export function managerSummaryLabel(model: ManagerSummaryInput): string | null {
  const shiftsCount = model.coverageOverview.reduce(
    (sum, group) =>
      sum + group.technicians.length + group.supervisors.length + group.shadowTechnicians.length + group.shadowSupervisors.length,
    0,
  );
  const dutiesCount = model.duties.length;
  const absencesCount = model.absences.length;
  const urgentCount = model.issues.filter((issue) => issue.severity === "critical").length;
  const reviewCount = model.issues.filter((issue) => issue.severity === "review").length;
  const missingPotentialCount = model.potentialRequirements.filter(
    (requirement) => requirement.status === "missing" || requirement.status === "partial",
  ).length;

  const parts: string[] = [];
  if (shiftsCount > 0) parts.push(`${shiftsCount} משמרות`);
  if (dutiesCount > 0) parts.push(`${dutiesCount} תורנויות`);
  if (absencesCount > 0) parts.push(`${absencesCount} היעדרויות`);
  if (urgentCount > 0) parts.push(`${urgentCount} דחופים`);
  if (reviewCount > 0) parts.push(`${reviewCount} לבדיקה`);
  if (missingPotentialCount > 0) {
    parts.push(missingPotentialCount === 1 ? "דרישת Potential אחת חסרה" : `${missingPotentialCount} דרישות Potential חסרות`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
