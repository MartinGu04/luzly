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

/**
 * Whether a person can be assigned to shifts at all -- the ONLY structural
 * signal this codebase uses for "does this person work shifts themselves",
 * reusing the same capability flags `classifyRoleGroup` already reads.
 * Deliberately never a title-string check (e.g. matching "אחמ״ש") and
 * deliberately independent of `classifyPersonnelType` -- a permanent (קבע)
 * person could technically carry these flags too, though in practice
 * doesn't; personnelType answers "what's their employment category",
 * this answers "can they be rostered onto a shift", and the two are never
 * conflated. Used to gate the Manager Area's own shift snapshot section
 * (`lib/readModels/shiftSnapshot.ts`) onto exactly the manager population
 * that has personal shifts to see "what's happening around me" for.
 */
export function isShiftCapable(person: RoleGroupable): boolean {
  return person.isSupervisor || person.isTechnician;
}
