import type { AbsenceKind, DutyFamily, EventPeriod, EventRole } from "@/lib/domain/event";
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
  weapon_qualification_invalid: "הכשירות שלך למטווחים אינה בתוקף לשיבוץ הזה",
};

export function issueReasonLabel(reason: IssueReason): string {
  return ISSUE_REASON_LABELS[reason];
}

/**
 * Third-person variant of `issueReasonLabel` for the manager overview,
 * where an issue belongs to someone other than the viewer -- the personal
 * "שלך" ("your") phrasing above would be grammatically wrong once a
 * `personName` is displayed alongside it. Same reasons, same meaning,
 * neutral wording only.
 */
const MANAGER_ISSUE_REASON_LABELS: Record<IssueReason, string> = {
  blocking_absence_with_assignment: "קיימת חפיפה בין היעדרות לשיבוץ",
  shift_coverage_missing: "חסר כיסוי למשמרת",
  shift_coverage_partial: "הכיסוי למשמרת חלקי",
  invalid_shift_time: "שעות המשמרת דורשות בדיקה",
  role_capability_mismatch: "השיבוץ דורש בדיקת תפקיד",
  weapon_qualification_invalid: "הכשירות למטווחים אינה בתוקף לשיבוץ",
};

export function managerIssueReasonLabel(reason: IssueReason): string {
  return MANAGER_ISSUE_REASON_LABELS[reason];
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

/** The exact Hebrew phrase `event.ts` itself recognizes for each `AbsenceKind` -- the inverse of its `ABSENCE_KIND_BY_PHRASE` classification map. */
const ABSENCE_KIND_LABELS: Record<AbsenceKind, string> = {
  vacation: "חופש",
  abroad: 'חו"ל',
  medical: "גימלים",
  day_off: "יום ד",
  after: "אפטר",
  referral: "הפנייה",
};

export function absenceKindLabel(kind: AbsenceKind): string {
  return ABSENCE_KIND_LABELS[kind];
}
