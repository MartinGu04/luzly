import type { EmergencyAssignment } from "./emergencyShift";

export interface EmergencyFairnessCount {
  personId: string;
  total: number;
  day: number;
  night: number;
}

/**
 * Emergency shift fairness is NOT the normal "בוצעו משמרות / צפי
 * משמרות" expected-shift model (spec section 16) -- pure assignment
 * counting from the "משמרות" sheet's canonical C:L desk columns. One
 * populated desk cell = one assignment; the same person appearing in
 * two desk cells (even within the same shift) is genuinely two
 * assignments, matching the workbook's own assignment-count semantics.
 * Never computes expected shifts, never reads `גזירת נתונים`'s cached
 * numeric totals, never reproduces the workbook's inconsistent
 * historical COUNTIF ranges.
 *
 * Counts ONLY resolved assignments (`personId` non-null) -- an
 * unresolved raw name has nothing to attribute a count to. It stays
 * visible elsewhere (the raw assignment itself, manager diagnostics)
 * but is never silently folded into some resolved person's count.
 */
export function computeEmergencyFairnessCounts(
  assignments: readonly EmergencyAssignment[],
): Map<string, EmergencyFairnessCount> {
  const counts = new Map<string, EmergencyFairnessCount>();

  for (const assignment of assignments) {
    if (assignment.personId === null) continue;

    const existing = counts.get(assignment.personId) ?? {
      personId: assignment.personId,
      total: 0,
      day: 0,
      night: 0,
    };
    existing.total += 1;
    if (assignment.period === "day") existing.day += 1;
    else existing.night += 1;
    counts.set(assignment.personId, existing);
  }

  return counts;
}
