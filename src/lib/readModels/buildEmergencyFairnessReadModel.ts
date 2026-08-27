import { computeEmergencyFairnessCounts } from "@/lib/domain/emergencyFairness";
import type { EmergencyAssignment } from "@/lib/domain/emergencyShift";
import type { Person } from "@/lib/domain/types";
import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";
import {
  EMERGENCY_FAIRNESS_GROUP_LABELS,
  type EmergencyFairnessGroupMembership,
} from "@/lib/parsers/emergencyFairnessGroups";
import type { EmergencyFairnessGroupView, EmergencyFairnessReadModel } from "./emergencyFairnessTypes";

/** Shown for a person with real emergency assignments who appears in none of the four `גזירת נתונים` groups (spec section 17: "do not hide them"). */
export const EMERGENCY_FAIRNESS_FALLBACK_GROUP_LABEL = "אחרים / לא מסווג";

export interface BuildEmergencyFairnessReadModelInput {
  activePeriod: EmergencyModePeriod | null;
  assignments: readonly EmergencyAssignment[];
  people: readonly Person[];
  groupMembership: EmergencyFairnessGroupMembership;
  fetchedAt: string;
}

/** Same normalization convention as `lib/parsers/emergencySchedule.ts`'s `normalizeName` -- NFC + invisible bidi/formatting marks + NBSP + whitespace collapse, exact-match only. */
const BIDI_CONTROL_CHARS_RE = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;
const NBSP_RE = /\u00A0/g;

function normalizeName(text: string): string {
  return text
    .normalize("NFC")
    .replace(BIDI_CONTROL_CHARS_RE, "")
    .replace(NBSP_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparePersonRows(a: { personName: string; personId: string }, b: { personName: string; personId: string }): number {
  if (a.personName !== b.personName) return a.personName < b.personName ? -1 : 1;
  return a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0;
}

/**
 * Combines the C:L assignment-count model with `גזירת נתונים`'s group
 * membership into the emergency fairness presentation. Every resolved
 * person with at least one emergency assignment appears in exactly one
 * group: their matched `גזירת נתונים` group, or the fallback group when
 * they appear in none (spec section 17) -- never hidden, never
 * duplicated across groups.
 */
export function buildEmergencyFairnessReadModel(
  input: BuildEmergencyFairnessReadModelInput,
): EmergencyFairnessReadModel {
  const counts = computeEmergencyFairnessCounts(input.assignments);
  const peopleById = new Map(input.people.map((person) => [person.id, person]));

  const groupLabelByNormalizedName = new Map<string, string>();
  for (const label of EMERGENCY_FAIRNESS_GROUP_LABELS) {
    for (const rawName of input.groupMembership.membersByGroup[label] ?? []) {
      groupLabelByNormalizedName.set(normalizeName(rawName), label);
    }
  }

  const allLabels = [...EMERGENCY_FAIRNESS_GROUP_LABELS, EMERGENCY_FAIRNESS_FALLBACK_GROUP_LABEL];
  const rowsByGroup = new Map<string, EmergencyFairnessGroupView["rows"]>();
  for (const label of allLabels) rowsByGroup.set(label, []);

  for (const count of counts.values()) {
    const person = peopleById.get(count.personId);
    const personName = person?.name ?? count.personId;
    const group = person
      ? (groupLabelByNormalizedName.get(normalizeName(person.name)) ?? EMERGENCY_FAIRNESS_FALLBACK_GROUP_LABEL)
      : EMERGENCY_FAIRNESS_FALLBACK_GROUP_LABEL;

    rowsByGroup.get(group)!.push({ personId: count.personId, personName, total: count.total, day: count.day, night: count.night });
  }

  const groups: EmergencyFairnessGroupView[] = allLabels
    .map((label) => ({ label, rows: [...(rowsByGroup.get(label) ?? [])].sort(comparePersonRows) }))
    .filter((group) => group.rows.length > 0);

  return { activePeriod: input.activePeriod, fetchedAt: input.fetchedAt, groups };
}
