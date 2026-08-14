import type { ManagerPersonSummary } from "@/lib/readModels/managerTypes";

export type RosterPersonnelTypeGroup = "permanent" | "regular" | "reserve" | "unclassified";

const PERSONNEL_TYPE_GROUP_LABEL: Record<RosterPersonnelTypeGroup, string> = {
  permanent: "קבע",
  regular: "סדיר",
  reserve: "מילואים",
  unclassified: "לא מסווג",
};

export function personnelTypeGroupLabel(group: RosterPersonnelTypeGroup): string {
  return PERSONNEL_TYPE_GROUP_LABEL[group];
}

/**
 * Pure `personnelType` -> roster top-level group mapping (Design Pass PR
 * #21 §22): "קבע"->קבע, "חובה"->סדיר, "מילואים"->מילואים. Whitespace is
 * trimmed/collapsed only -- no fuzzy classification, no partial match. A
 * `null`/unrecognized value always falls to "לא מסווג" -- a person is NEVER
 * dropped from the roster for having an unrecognized or missing type.
 */
export function classifyPersonnelType(personnelType: string | null): RosterPersonnelTypeGroup {
  if (personnelType === null) return "unclassified";
  const normalized = personnelType.replace(/\s+/g, " ").trim();
  if (normalized === "קבע") return "permanent";
  if (normalized === "חובה") return "regular";
  if (normalized === "מילואים") return "reserve";
  return "unclassified";
}

export type RosterRegularRoleGroup = "supervisor" | "technician" | "other";

const REGULAR_ROLE_GROUP_LABEL: Record<RosterRegularRoleGroup, string> = {
  supervisor: "אחמ״שים",
  technician: "טכנאים",
  other: "אחרים",
};

export function regularRoleGroupLabel(group: RosterRegularRoleGroup): string {
  return REGULAR_ROLE_GROUP_LABEL[group];
}

/**
 * ONLY called for the "סדיר" top-level group -- קבע/מילואים/לא מסווג never
 * subdivide by role. `isSupervisor` takes precedence even when the same
 * person is also `isTechnician` (a supervisor who can also work as a
 * technician still appears exactly once, under אחמ״שים) -- this never
 * changes the underlying domain flags, it only decides which ONE
 * presentation bucket a person lands in.
 */
export function classifyRegularRole(
  person: Pick<ManagerPersonSummary, "isSupervisor" | "isTechnician">,
): RosterRegularRoleGroup {
  if (person.isSupervisor) return "supervisor";
  if (person.isTechnician) return "technician";
  return "other";
}

export interface RosterRegularSubgroup {
  group: RosterRegularRoleGroup;
  label: string;
  people: ManagerPersonSummary[];
}

export interface RosterTopGroup {
  group: RosterPersonnelTypeGroup;
  label: string;
  /** Direct people rows -- populated for קבע/מילואים/לא מסווג, always empty for סדיר (see `subgroups` instead). */
  people: ManagerPersonSummary[];
  /** Only ever non-empty for the "סדיר" group. */
  subgroups: RosterRegularSubgroup[];
}

const TOP_GROUP_ORDER: readonly RosterPersonnelTypeGroup[] = ["permanent", "regular", "reserve", "unclassified"];
const REGULAR_SUBGROUP_ORDER: readonly RosterRegularRoleGroup[] = ["supervisor", "technician", "other"];

/**
 * The manager roster's presentation hierarchy (Design Pass PR #21 §22):
 * top-level groups קבע/סדיר/מילואים/לא מסווג, each rendered only when
 * non-empty; ONLY סדיר subdivides further into אחמ״שים/טכנאים/אחרים. Every
 * person appears EXACTLY ONCE across the whole result -- never duplicated
 * across groups or subgroups. Presentation-only: never mutates or
 * re-derives `ManagerPersonSummary`'s own flags. Preserves the roster's own
 * existing deterministic order within each (sub)group -- never re-sorts.
 */
export function groupRosterHierarchy(roster: readonly ManagerPersonSummary[]): RosterTopGroup[] {
  const byTopGroup = new Map<RosterPersonnelTypeGroup, ManagerPersonSummary[]>();
  for (const person of roster) {
    const key = classifyPersonnelType(person.personnelType);
    const bucket = byTopGroup.get(key);
    if (bucket) bucket.push(person);
    else byTopGroup.set(key, [person]);
  }

  const result: RosterTopGroup[] = [];

  for (const topGroup of TOP_GROUP_ORDER) {
    const people = byTopGroup.get(topGroup);
    if (!people || people.length === 0) continue;

    if (topGroup !== "regular") {
      result.push({ group: topGroup, label: personnelTypeGroupLabel(topGroup), people, subgroups: [] });
      continue;
    }

    const bySubgroup = new Map<RosterRegularRoleGroup, ManagerPersonSummary[]>();
    for (const person of people) {
      const subKey = classifyRegularRole(person);
      const bucket = bySubgroup.get(subKey);
      if (bucket) bucket.push(person);
      else bySubgroup.set(subKey, [person]);
    }

    const subgroups: RosterRegularSubgroup[] = [];
    for (const subGroup of REGULAR_SUBGROUP_ORDER) {
      const subPeople = bySubgroup.get(subGroup);
      if (!subPeople || subPeople.length === 0) continue;
      subgroups.push({ group: subGroup, label: regularRoleGroupLabel(subGroup), people: subPeople });
    }

    result.push({ group: topGroup, label: personnelTypeGroupLabel(topGroup), people: [], subgroups });
  }

  return result;
}
