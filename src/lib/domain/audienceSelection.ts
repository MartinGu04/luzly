import { type AudienceGroupKey, type AudienceGroupable, personMatchesAnyAudienceGroup } from "./audienceGroups";

/**
 * The three ways a manager can target a notification's audience (spec
 * "קהל יעד"): every domain-eligible person, a dynamic union of groups, or
 * an explicit list of specific people. Exclusions (`excludedPersonIds` on
 * `NotificationAudienceSelection`) are a SEPARATE, always-applied
 * dimension -- never a fourth mode -- so "לא לשלוח ל" composes with any of
 * the three below.
 */
export type NotificationAudienceMode = "all_eligible" | "groups" | "people";

/**
 * A notification's stored audience INTENT/CONFIGURATION -- never a
 * resolved recipient snapshot (spec: "Store audience intent/configuration,
 * not resolved recipient snapshots"). `groupKeys` is meaningful only when
 * `mode === "groups"`, `personIds` only when `mode === "people"`;
 * `excludedPersonIds` always applies, independent of `mode`.
 */
export interface NotificationAudienceSelection {
  mode: NotificationAudienceMode;
  groupKeys: readonly AudienceGroupKey[];
  personIds: readonly string[];
  excludedPersonIds: readonly string[];
}

/** The safe, current-behavior-preserving default -- every domain-eligible person, nothing excluded. Applying this selection is always a no-op filter. */
export const ALL_ELIGIBLE_AUDIENCE_SELECTION: NotificationAudienceSelection = {
  mode: "all_eligible",
  groupKeys: [],
  personIds: [],
  excludedPersonIds: [],
};

/**
 * Whether `person` -- already assumed domain-eligible by the caller (see
 * this module's own file docstring) -- survives `selection`. Exclusion is
 * checked FIRST and unconditionally, before the mode branch, so an
 * explicit "לא לשלוח ל" entry always wins regardless of how many other
 * ways `person` would otherwise qualify (multiple selected groups, direct
 * "people" selection, or "all_eligible") -- spec: "Explicit exclusions
 * always win."
 */
export function personMatchesAudienceSelection<T extends AudienceGroupable>(
  person: T,
  selection: NotificationAudienceSelection,
): boolean {
  if (selection.excludedPersonIds.includes(person.id)) return false;

  if (selection.mode === "groups") return personMatchesAnyAudienceGroup(person, selection.groupKeys);
  if (selection.mode === "people") return selection.personIds.includes(person.id);
  return true; // "all_eligible"
}

/**
 * THE one pure, shared audience resolver (spec: "Prefer one pure/shared
 * audience resolver used by preview/count, manual send, scheduled
 * notifications, and recurring notification rules"). `eligiblePeople` is
 * ALWAYS whatever the caller's own domain-eligibility computation already
 * produced -- for a system/automatic notification, the real
 * shift/duty/logistics/non-permanent-constraints recipient set; for a
 * manager-created notification, the Notification Center's own intended
 * eligible population (typically the full current roster). This function
 * has NO domain knowledge of its own and can only ever NARROW
 * `eligiblePeople` -- it filters and deduplicates, it never adds anyone who
 * isn't already present in `eligiblePeople` (spec: "audience groups are
 * FILTERS ONLY... must NEVER broaden the notification's existing domain
 * eligibility"). This single narrowing-only shape is what makes the קבע/
 * constraint-reminders hard rule hold automatically: as long as a caller
 * never includes a קבע person in `eligiblePeople` to begin with, no
 * audience configuration passed here -- selecting the קבע group, manually
 * selecting a קבע person, or "all_eligible" -- can ever make them appear
 * in the result.
 *
 * Preserves `eligiblePeople`'s own relative order and deduplicates by
 * `id` (spec: "Deduplicate recipients by canonical person/user identity")
 * -- a person who would otherwise appear twice (e.g. present twice in the
 * input) is included at most once.
 */
export function resolveNotificationAudience<T extends AudienceGroupable>(
  eligiblePeople: readonly T[],
  selection: NotificationAudienceSelection,
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const person of eligiblePeople) {
    if (seen.has(person.id)) continue;
    if (!personMatchesAudienceSelection(person, selection)) continue;
    seen.add(person.id);
    result.push(person);
  }
  return result;
}
