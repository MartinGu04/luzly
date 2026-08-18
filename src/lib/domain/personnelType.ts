/**
 * A person's normalized service category, derived from the raw
 * `Person.personnelType` string read from כ"א. Domain semantics, not a
 * presentation concern -- shift-coverage-recommendation participation
 * rules (`shiftCoverageRecommendation.ts`, PR #39) and the roster's own
 * קבע/סדיר/מילואים grouping (`lib/presentation/roster.ts`) both need the
 * EXACT same classification, so it's defined here ONCE and reused by both,
 * never duplicated.
 */
export type PersonnelServiceCategory = "permanent" | "regular" | "reserve" | "unclassified";

/**
 * Pure `personnelType` -> service-category mapping: "קבע" -> permanent,
 * "חובה" -> regular, "מילואים" -> reserve. Whitespace is trimmed/collapsed
 * only -- no fuzzy classification, no partial match. A `null`/unrecognized
 * value always falls to "unclassified" -- a person is NEVER dropped for
 * having an unrecognized or missing type, and never silently assumed to
 * belong to any specific category either.
 */
export function classifyPersonnelType(personnelType: string | null): PersonnelServiceCategory {
  if (personnelType === null) return "unclassified";
  const normalized = personnelType.replace(/\s+/g, " ").trim();
  if (normalized === "קבע") return "permanent";
  if (normalized === "חובה") return "regular";
  if (normalized === "מילואים") return "reserve";
  return "unclassified";
}

/**
 * Which shift-rotation role group a person belongs to, from their actual
 * capability flags -- never from a job-title string. This is the same
 * grouping rule `lib/presentation/roster.ts`'s roster listing already
 * applied (now co-located here so `lib/domain/fairnessGroups.ts`'s
 * comparison-group foundation and the roster hierarchy share ONE
 * definition, the same convention this file already set for
 * `classifyPersonnelType` itself -- see that function's own docstring).
 */
export type FairnessRoleGroupKey = "supervisor" | "technician" | "other";

/** The minimal shape `classifyRoleGroup` needs -- any typed record carrying these two capability flags. */
export interface RoleGroupable {
  isSupervisor: boolean;
  isTechnician: boolean;
}

/**
 * `isSupervisor` takes precedence even when the same person is also
 * `isTechnician` (a supervisor who can also work as a technician still
 * counts once, as "supervisor") -- never mutates the input, never
 * re-derives the underlying flags.
 */
export function classifyRoleGroup(person: RoleGroupable): FairnessRoleGroupKey {
  if (person.isSupervisor) return "supervisor";
  if (person.isTechnician) return "technician";
  return "other";
}

/** A shift-staffed role -- the two roles a shift Event's own `role` field (and `MissingCoverageRole`/`FairnessEligibilityRole`, both structurally this same union) can ever be. */
export type ShiftRole = "technician" | "supervisor";

/**
 * The ONE canonical "does this person's כ"א capability flag make them
 * eligible for shift role R" predicate -- reused by shift-coverage
 * recommendation eligibility (`shiftCoverageRecommendation.ts`) and
 * Fairness role eligibility (`fairnessParticipation.ts`), which both used
 * to carry their own identical inline `role === "technician" ?
 * person.isTechnician : person.isSupervisor` ternary. Consolidated here so
 * the two can never independently drift into two different definitions of
 * "shift worker" for the same role.
 *
 * Purely the capability flag -- no personnelType, no Event/participation
 * evidence, no absence/conflict checking; each caller layers its own
 * further eligibility rules on TOP of this, never instead of it. A person
 * with `isTechnician: false` and `isSupervisor: false` (duties/personnel
 * roster membership only, not a shift worker) is never eligible for
 * either role here, by construction -- this is what keeps such a person
 * out of every shift-role candidate pool without a name-based exclusion.
 */
export function hasShiftRoleCapability(person: RoleGroupable, role: ShiftRole): boolean {
  return role === "technician" ? person.isTechnician : person.isSupervisor;
}
