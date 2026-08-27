/**
 * The dedicated Emergency Mode domain model -- deliberately separate
 * from the regular `Event`/`EventRole` model (`lib/domain/event.ts`). A
 * desk is not a role: Emergency Mode desk assignments must NEVER be
 * encoded into `Event.role`, a title string, or the supervisor/
 * technician arrays (spec section 7). Read models / presentation
 * adapters may expose a `desk` field where useful, but the core regular
 * `Event` model stays semantically honest about the regular shift world
 * it describes.
 */
export type EmergencyShiftPeriod = "day" | "night";

/**
 * One populated desk cell in the "משמרות" sheet -- the canonical
 * emergency-fairness unit ("one populated desk cell = one emergency
 * assignment", spec section 16).
 */
export interface EmergencyAssignment {
  /** Calendar date, "YYYY-MM-DD" (Asia/Jerusalem). */
  date: string;
  period: EmergencyShiftPeriod;
  /** Canonical current desk name, see `lib/domain/emergencyDesks.ts`. */
  desk: string;
  /** Resolved personnel id, or `null` when the cell's name text could not be safely/uniquely resolved (spec section 8) -- an unresolved assignment is still surfaced, never dropped. */
  personId: string | null;
  /** The raw, as-typed name text from the cell -- always preserved for manager-facing display, even when `personId` is null. */
  personName: string;
  sourceCell: string;
}

/** Every assignment for one date+period, grouped for presentation (day/night -> desks -> people). */
export interface EmergencyShift {
  date: string;
  period: EmergencyShiftPeriod;
  assignments: EmergencyAssignment[];
}

/** Groups a flat assignment list into `EmergencyShift`s, one per distinct (date, period) pair, dates ascending then day before night. */
export function groupEmergencyAssignmentsIntoShifts(
  assignments: readonly EmergencyAssignment[],
): EmergencyShift[] {
  const byKey = new Map<string, EmergencyAssignment[]>();
  for (const assignment of assignments) {
    const key = `${assignment.date}|${assignment.period}`;
    const group = byKey.get(key);
    if (group) group.push(assignment);
    else byKey.set(key, [assignment]);
  }

  const periodOrder: Record<EmergencyShiftPeriod, number> = { day: 0, night: 1 };
  return [...byKey.entries()]
    .map(([key, groupAssignments]) => {
      const [date, period] = key.split("|") as [string, EmergencyShiftPeriod];
      return { date, period, assignments: groupAssignments };
    })
    .sort((a, b) => (a.date === b.date ? periodOrder[a.period] - periodOrder[b.period] : a.date < b.date ? -1 : 1));
}
