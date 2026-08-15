import type { ManagerShiftOverviewEntry } from "@/lib/readModels/managerTypes";
import { roleLabel } from "./labels";

type ManagerIssueRoleCoverage = ManagerShiftOverviewEntry["roleCoverage"];

const TECHNICIAN_LABEL = roleLabel("technician") ?? "טכנאי";
const SUPERVISOR_LABEL = roleLabel("supervisor") ?? 'אחמ"ש';

/**
 * Manager-facing "what's missing for this shift" wording for a
 * `shift_coverage_missing`/`shift_coverage_partial` `ManagerIssue` --
 * derived from the SAME `roleCoverage` diagnostic `analyzeUnitShiftCoverage()`
 * already produces for the matching date+period coverage group (PR #21
 * follow-up consistency fix). No second coverage algorithm, no guessing
 * from rendered names -- this is presentation-only enrichment of the
 * MANAGER issue view, never a change to `OperationalIssue`/`PersonalIssue`
 * semantics (those stay generic, unchanged, shared with the dashboard's
 * personal issue views).
 *
 * Priority: both roles provably missing outranks a single missing role,
 * which outranks a role-specific partial gap. `fallback` (the existing
 * generic `managerIssueReasonLabel` text) is used whenever neither role is
 * provably missing/partial for that shift (e.g. both `not_evaluable`) --
 * this NEVER invents a specific missing role without domain proof.
 */
export function managerIssueCoverageReasonLabel(
  roleCoverage: ManagerIssueRoleCoverage,
  fallback: string,
): string {
  const technicianMissing = roleCoverage.technician.status === "missing";
  const supervisorMissing = roleCoverage.supervisor.status === "missing";

  if (technicianMissing && supervisorMissing) {
    return `חסרים ${TECHNICIAN_LABEL} ו${SUPERVISOR_LABEL} למשמרת`;
  }
  if (technicianMissing) return `חסר ${TECHNICIAN_LABEL} למשמרת`;
  if (supervisorMissing) return `חסר ${SUPERVISOR_LABEL} למשמרת`;

  if (roleCoverage.technician.status === "partial") return `כיסוי ${TECHNICIAN_LABEL} חלקי במשמרת`;
  if (roleCoverage.supervisor.status === "partial") return `כיסוי ${SUPERVISOR_LABEL} חלקי במשמרת`;

  return fallback;
}
