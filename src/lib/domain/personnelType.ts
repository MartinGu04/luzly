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
