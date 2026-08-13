import type { DutyFamily, EventPeriod, EventRole } from "@/lib/domain/event";
import type { IssueReason, IssueSeverity, RoleCapabilityMismatchMetadata } from "@/lib/domain/operationalIssues";
import type { CoverageStatus } from "@/lib/domain/shiftCoverage";

/** Pure machine-reason -> friendly Hebrew copy mappings. Never render an `IssueReason`/`CoverageStatus` value directly in the UI. */

export function roleLabel(role: EventRole): string | null {
  if (role === "supervisor") return 'אחמ"ש';
  if (role === "technician") return "טכנאי";
  return null;
}

export function periodLabel(period: EventPeriod): string | null {
  if (period === "day") return "יום";
  if (period === "night") return "לילה";
  if (period === "morning") return "בוקר";
  return null;
}

const DUTY_FAMILY_LABELS: Record<DutyFamily, string> = {
  guard: "שמירה",
  reserve: "עתודה",
  evacuation_on_call: "כונן פינויים",
  full_kitchen: "מטבח מלא",
  daily_kitchen: "מטבח יומי",
  weekend_kitchen: 'מטבח סופ"ש',
  rasar: 'רס"ר',
  oxid: "אוקסיד",
  callup: "הקפצה",
};

export function dutyFamilyLabel(family: DutyFamily): string {
  return DUTY_FAMILY_LABELS[family];
}

const ISSUE_REASON_LABELS: Record<IssueReason, string> = {
  blocking_absence_with_assignment: "קיימת חפיפה בין היעדרות לשיבוץ שלך",
  shift_coverage_missing: "חסר כיסוי למשמרת שלך",
  shift_coverage_partial: "הכיסוי למשמרת שלך חלקי",
  invalid_shift_time: "שעות המשמרת דורשות בדיקה",
  role_capability_mismatch: "השיבוץ שלך דורש בדיקת תפקיד",
};

export function issueReasonLabel(reason: IssueReason): string {
  return ISSUE_REASON_LABELS[reason];
}

const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  critical: "דחוף",
  review: "לבדיקה",
  info: "לתשומת לב",
};

export function issueSeverityLabel(severity: IssueSeverity): string {
  return ISSUE_SEVERITY_LABELS[severity];
}

const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  full: "הכיסוי מלא",
  partial: "הכיסוי חלקי",
  missing: "אין כיסוי",
  not_evaluable: "לא ניתן להעריך כיסוי",
};

export function coverageStatusLabel(status: CoverageStatus): string {
  return COVERAGE_STATUS_LABELS[status];
}

/**
 * "אחמ"ש" / "טכנאי" for a `role_capability_mismatch` issue's
 * `requiredCapability` -- never the internal `isSupervisor`/`isTechnician`
 * metadata key itself.
 */
export function requiredCapabilityLabel(
  capability: RoleCapabilityMismatchMetadata["requiredCapability"],
): string {
  return capability === "isSupervisor" ? 'אחמ"ש' : "טכנאי";
}
