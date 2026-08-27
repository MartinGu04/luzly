import { classifyPersonnelType, type RoleGroupable } from "./personnelType";

/**
 * Every dynamic audience group a notification's "לפי קבוצות" targeting mode
 * can select -- two service-type groups (קבע/סדיר/מילואים already carved
 * out of `classifyPersonnelType`) plus two role groups
 * (`classifyRoleGroup`'s own supervisor/technician split). Deliberately
 * NOT "unclassified"/"other" -- those are "nothing reliable could be
 * determined about this person", never a real, manager-selectable
 * targeting group (spec: "Only expose role groups that can be derived
 * reliably from existing canonical data").
 *
 * Membership is always evaluated fresh against whatever roster snapshot a
 * caller passes in (`personMatchesAudienceGroup`/`resolveAudienceGroupMembers`
 * below) -- a group key is never resolved once and frozen into a list of
 * person ids. This is what makes "לפי קבוצות" targeting dynamic: a person
 * who joins/leaves קבע, or gains/loses אחמ״ש status, is picked up
 * automatically the next time membership is evaluated, with zero stored
 * configuration to update.
 */
export type AudienceGroupKey = "permanent" | "regular" | "reserve" | "supervisor" | "technician";

export const AUDIENCE_GROUP_KEYS: readonly AudienceGroupKey[] = [
  "permanent",
  "regular",
  "reserve",
  "supervisor",
  "technician",
];

const AUDIENCE_GROUP_KEY_SET: ReadonlySet<string> = new Set<AudienceGroupKey>(AUDIENCE_GROUP_KEYS);

export function isAudienceGroupKey(value: string): value is AudienceGroupKey {
  return AUDIENCE_GROUP_KEY_SET.has(value);
}

/**
 * The minimal real-data shape group membership needs -- deliberately the
 * same small `personnelType`/`isSupervisor`/`isTechnician` fields
 * `classifyPersonnelType`/`classifyRoleGroup` already key off, plus a
 * stable `id`. Both the server's own `Person` (`lib/domain/types.ts`) and
 * the Manager UI's `ManagerPersonSummary` projection satisfy this
 * structurally, so the exact same predicate/resolver below runs
 * identically server-side (send/preview resolution) and client-side (the
 * composer's own live preview) -- never two separate group-membership
 * implementations that could drift.
 */
export interface AudienceGroupable extends RoleGroupable {
  id: string;
  personnelType: string | null;
}

/** Whether `person` belongs to the group `key` -- pure, structural, never a name/title guess. */
export function personMatchesAudienceGroup(person: AudienceGroupable, key: AudienceGroupKey): boolean {
  switch (key) {
    case "permanent":
    case "regular":
    case "reserve":
      return classifyPersonnelType(person.personnelType) === key;
    case "supervisor":
      return person.isSupervisor;
    case "technician":
      return person.isTechnician;
    default:
      return false;
  }
}

/** Whether `person` belongs to ANY of `keys` -- the union semantics multi-selecting groups requires (spec: "multiple groups union correctly"). An empty `keys` matches no one. */
export function personMatchesAnyAudienceGroup(person: AudienceGroupable, keys: readonly AudienceGroupKey[]): boolean {
  return keys.some((key) => personMatchesAudienceGroup(person, key));
}

/**
 * Every person in `people` who belongs to at least one of `keys`, in the
 * SAME order they appear in `people`, deduplicated by `id`. Always computed
 * fresh against the `people` snapshot passed in -- never cached/frozen --
 * so a roster change between two calls is reflected automatically (spec:
 * "groups dynamically reflect roster changes at send time").
 */
export function resolveAudienceGroupMembers<T extends AudienceGroupable>(
  people: readonly T[],
  keys: readonly AudienceGroupKey[],
): T[] {
  if (keys.length === 0) return [];
  const seen = new Set<string>();
  const result: T[] = [];
  for (const person of people) {
    if (seen.has(person.id)) continue;
    if (!personMatchesAnyAudienceGroup(person, keys)) continue;
    seen.add(person.id);
    result.push(person);
  }
  return result;
}
