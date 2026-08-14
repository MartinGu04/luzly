import type { ManagerRoleCoverageView } from "@/lib/readModels/managerTypes";
import { formatMissingIntervals } from "./scheduleTime";

export type ManagerRoleCoverageRoleName = "technician" | "supervisor";

const ROLE_DISPLAY_LABEL: Record<ManagerRoleCoverageRoleName, string> = {
  technician: "טכנאי",
  supervisor: 'אחמ"ש',
};

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
