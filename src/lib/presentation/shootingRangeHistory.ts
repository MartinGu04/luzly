import type { ShootingRangeHistoryEntry } from "@/lib/readModels/buildShootingRangeQualificationReadModel";

const SOURCE_LABELS: Record<ShootingRangeHistoryEntry["source"], string> = {
  sheet_baseline: "יבוא מהגיליון",
  self_report: "דיווח עצמי",
  planned_range_confirmation: "אישור מנהל",
  manager_manual: "רישום ידני",
};

const STATUS_LABELS: Record<ShootingRangeHistoryEntry["status"], string> = {
  approved: "✅ אושר",
  pending: "🟡 ממתין לאישור",
  rejected: "לא אושר",
};

export function shootingRangeHistorySourceLabel(source: ShootingRangeHistoryEntry["source"]): string {
  return SOURCE_LABELS[source];
}

export function shootingRangeHistoryStatusLabel(status: ShootingRangeHistoryEntry["status"]): string {
  return STATUS_LABELS[status];
}
