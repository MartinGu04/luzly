import type { AbsenceKind, DutyFamily } from "@/lib/domain/event";
import type { ManagerAbsenceRowView, ManagerDutyRowView } from "@/components/manager/types";
import { absenceKindLabel, dutyFamilyLabel } from "./labels";
import { assignmentEmoji, dutyFamilyEmoji } from "./emoji";

export interface ManagerDutyGroupView {
  key: DutyFamily;
  label: string;
  emoji: string | null;
  rows: ManagerDutyRowView[];
}

export interface ManagerAbsenceGroupView {
  key: AbsenceKind;
  label: string;
  emoji: string | null;
  rows: ManagerAbsenceRowView[];
}

/** Same fixed order as `DUTY_FAMILY_LABELS`/`ABSENCE_KIND_LABELS` in `labels.ts` -- deterministic, never re-sorted by count or recency. */
const DUTY_FAMILY_ORDER: readonly DutyFamily[] = [
  "guard",
  "reserve",
  "evacuation_on_call",
  "full_kitchen",
  "daily_kitchen",
  "weekend_kitchen",
  "rasar",
  "oxid",
  "callup",
];

const ABSENCE_KIND_ORDER: readonly AbsenceKind[] = ["vacation", "abroad", "medical", "day_off", "after", "referral"];

/**
 * Groups manager duty rows by their typed `dutyFamily` (Design Pass PR #21
 * §15) -- e.g. "שמירה 1" and "שמירה 2" (same family, different `slot`)
 * group together under one "שמירה" group, while a different family always
 * gets its own group. Never groups by `dutyBlockTitle`/raw text, and never
 * renders an empty group. Rows keep their original relative order within
 * each group.
 */
export function groupManagerDuties(duties: readonly ManagerDutyRowView[]): ManagerDutyGroupView[] {
  const byFamily = new Map<DutyFamily, ManagerDutyRowView[]>();
  for (const duty of duties) {
    const bucket = byFamily.get(duty.dutyFamily);
    if (bucket) bucket.push(duty);
    else byFamily.set(duty.dutyFamily, [duty]);
  }

  const groups: ManagerDutyGroupView[] = [];
  for (const family of DUTY_FAMILY_ORDER) {
    const rows = byFamily.get(family);
    if (!rows || rows.length === 0) continue;
    groups.push({ key: family, label: dutyFamilyLabel(family), emoji: dutyFamilyEmoji(family), rows });
  }
  return groups;
}

/**
 * Groups manager absence rows by their typed `absenceKind` (Design Pass PR
 * #21 §16) -- same convention as `groupManagerDuties`: never an empty
 * group, never re-sorted, deterministic fixed order.
 */
export function groupManagerAbsences(absences: readonly ManagerAbsenceRowView[]): ManagerAbsenceGroupView[] {
  const byKind = new Map<AbsenceKind, ManagerAbsenceRowView[]>();
  for (const absence of absences) {
    const bucket = byKind.get(absence.absenceKind);
    if (bucket) bucket.push(absence);
    else byKind.set(absence.absenceKind, [absence]);
  }

  const groups: ManagerAbsenceGroupView[] = [];
  for (const kind of ABSENCE_KIND_ORDER) {
    const rows = byKind.get(kind);
    if (!rows || rows.length === 0) continue;
    groups.push({
      key: kind,
      label: absenceKindLabel(kind),
      emoji: assignmentEmoji({ category: "absence", period: "unspecified", dutyFamily: null, absenceKind: kind }),
      rows,
    });
  }
  return groups;
}
