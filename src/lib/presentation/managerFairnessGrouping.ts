import { resolveFairnessAllocationRole } from "@/lib/domain/fairnessAnalysis";
import type { ManagerFairnessRowCardView } from "@/components/manager/fairness/types";

export type ManagerFairnessRoleGroupKey = "supervisor" | "technician" | "other";

export interface ManagerFairnessRoleGroupView {
  key: ManagerFairnessRoleGroupKey;
  label: string;
  rows: ManagerFairnessRowCardView[];
}

const GROUP_LABEL: Record<ManagerFairnessRoleGroupKey, string> = {
  supervisor: "אחמ״שים",
  technician: "טכנאים",
  other: "אחרים",
};

const GROUP_ORDER: readonly ManagerFairnessRoleGroupKey[] = ["supervisor", "technician", "other"];

/**
 * Groups fairness table rows by role using the EXISTING
 * `resolveFairnessAllocationRole()` classifier (only exact 'אחמ"ש'/"טכנאי"
 * allocation labels resolve; everything else -- ר"צ, הסמכה, an unknown
 * label -- falls to `other`/אחרים, never guessed). Presentation-only:
 * NEVER re-sorts rows within a group -- the read model already sorts by
 * normalized load, and that relative order is preserved exactly inside
 * each group (Design Pass PR #21 §31/§32). Never renders an empty group,
 * never labels a group's first row "מומלץ"/"הבא"/"עדיפות".
 */
export function groupManagerFairnessRows(
  rows: readonly ManagerFairnessRowCardView[],
): ManagerFairnessRoleGroupView[] {
  const byGroup = new Map<ManagerFairnessRoleGroupKey, ManagerFairnessRowCardView[]>();
  for (const row of rows) {
    const role = resolveFairnessAllocationRole(row.allocationLabel);
    const key: ManagerFairnessRoleGroupKey = role ?? "other";
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(row);
    else byGroup.set(key, [row]);
  }

  const groups: ManagerFairnessRoleGroupView[] = [];
  for (const key of GROUP_ORDER) {
    const rowsForGroup = byGroup.get(key);
    if (!rowsForGroup || rowsForGroup.length === 0) continue;
    groups.push({ key, label: GROUP_LABEL[key], rows: rowsForGroup });
  }
  return groups;
}
