import type { Person } from "./types";

/**
 * Who a Potential allocation's `sourceAllocationLabel` organizationally
 * belongs to, for the sole purpose of scoping Manager Overview to the
 * תקש"ל / תקשאס team's own responsibility (PR #16). This is deliberately
 * NOT the same question `PotentialAllocation.resolvedSourcePersonId`
 * answers (an exact full-name match, used for `sourceConflict`) -- a
 * label can be team-owned via a short first name or an organizational
 * alias without exactly matching any personnel record's full name.
 *
 * `unknown` fails closed: an unrecognized source is neither our team's
 * responsibility nor confidently someone else's -- it must never enter
 * Manager Overview's Potential reconciliation (see
 * `isManagerOwnedPotentialAllocation`), but it is also never asserted to
 * be "external" without evidence.
 */
export type PotentialSourceOwnership =
  | { kind: "team_alias" }
  | { kind: "team_person"; personId: string }
  | { kind: "external" }
  | { kind: "unknown" };

/**
 * Known organizational aliases for THIS team, canonicalized (quotes
 * stripped, whitespace collapsed) -- see `canonicalizeForAliasComparison`.
 * "תקש\"ל"/"תקש״ל"/"תקשל" all canonicalize to "תקשל"; "תקשאס"/
 * "תקש\"אס"/"תקש״אס" all canonicalize to "תקשאס".
 */
const TEAM_ALIAS_CANONICAL_FORMS: ReadonlySet<string> = new Set(["תקשל", "תקשאס"]);

/**
 * Known organizational source tokens that are NEVER this team's
 * responsibility, matched against the LEADING token of a canonicalized
 * label only (PR #16 §11/§12) -- e.g. "איתן מרכז", "איתן צפון", "איתן א",
 * bare "איתן", and "סייבר החלפה איתן" (leading token "סייבר") are all
 * external even though a real person's first name is "איתן". This
 * leading-token check runs BEFORE short first-name person resolution, so
 * an organizational label never accidentally resolves to a same-named
 * person (PR #16 §4/§11) -- it does NOT run before an EXACT full-name
 * match (see `classifyPotentialSourceOwnership`), since an exact full
 * name is stronger, unambiguous evidence than a coincidental leading-word
 * collision.
 *
 * `אמל"ח קצה` / `אמלח קצה` both canonicalize to "אמלח קצה" -> leading
 * token "אמלח". `מ"א` canonicalizes to "מא" -> leading token "מא".
 */
const KNOWN_EXTERNAL_LEADING_TOKENS: ReadonlySet<string> = new Set([
  "איתן",
  "רוקם",
  "מבצעים",
  "סייבר",
  "מא",
  "אמלח",
  "מנהלה",
]);

/** Every quote-like character (ASCII, Hebrew geresh/gershayim, smart quotes) treated as insignificant for alias/external-token comparison only. */
const QUOTE_CHARACTERS_RE = /[׳״"'‘’“”]/g;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Conservative, deterministic canonicalization for ORGANIZATIONAL
 * alias/external-token comparison ONLY -- never used for person full-name
 * comparison (PR #16 §8/§9). Strips quote-like characters entirely (so
 * `תקש"ל`/`תקש״ל`/`תקשל` compare equal) and collapses whitespace. No
 * fuzzy matching: everything else (letters, spaces between words) is
 * compared exactly.
 */
function canonicalizeForAliasComparison(text: string): string {
  return collapseWhitespace(text.replace(QUOTE_CHARACTERS_RE, ""));
}

function leadingToken(canonicalLabel: string): string {
  return canonicalLabel.split(" ")[0] ?? "";
}

/** Whitespace-normalized full-name comparison key -- same convention as `lib/parsers/potential.ts`'s `normalizeAllocationText`. Quotes are NOT stripped here; this is a different, stricter comparison than alias canonicalization. */
function normalizeFullName(text: string): string {
  return collapseWhitespace(text);
}

interface PersonNameIndex {
  byFullName: ReadonlyMap<string, Person[]>;
  byFirstName: ReadonlyMap<string, Person[]>;
}

function buildPersonNameIndex(personnel: readonly Person[]): PersonNameIndex {
  const byFullName = new Map<string, Person[]>();
  const byFirstName = new Map<string, Person[]>();

  for (const person of personnel) {
    const fullNameKey = normalizeFullName(person.name);
    const fullNameGroup = byFullName.get(fullNameKey);
    if (fullNameGroup) fullNameGroup.push(person);
    else byFullName.set(fullNameKey, [person]);

    const firstNameKey = leadingToken(normalizeFullName(person.name));
    const firstNameGroup = byFirstName.get(firstNameKey);
    if (firstNameGroup) firstNameGroup.push(person);
    else byFirstName.set(firstNameKey, [person]);
  }

  return { byFullName, byFirstName };
}

/** Exactly one match resolves; zero or 2+ matches never resolve (PR #16 §9/§10/§21) -- no arbitrary/last-write-wins pick. */
function resolveUniqueMatch(matches: readonly Person[] | undefined): Person | null {
  return matches?.length === 1 ? matches[0] : null;
}

/**
 * Classifies a Potential source label's organizational ownership. Order
 * matters and is deliberate (PR #16 hardening):
 *
 * 1. Exact team-alias match (quote-insensitive canonical comparison).
 * 2. Exact full personnel name match (strongest person evidence --
 *    checked before the external leading-token check, since a literal
 *    full name is not a coincidental collision).
 * 3. Known external leading-token match (organizational labels win over
 *    short-name/annotated-name person shorthand from this point on).
 * 4. Unique short first-name match on the label's leading token --
 *    covers both a bare short name ("מרטin") and a "person + annotation"
 *    label ("מארק - הוקפץ מא", "טוביה - החלפה סייבר") since only the
 *    LEADING token is ever used to resolve a person -- trailing text
 *    (including another organization's name) never overrides it, and
 *    never gets parsed as natural language beyond that leading token.
 * 5. `unknown` -- fails closed, never guessed.
 *
 * Pure, deterministic, no fuzzy matching anywhere.
 */
export function classifyPotentialSourceOwnership(
  sourceAllocationLabel: string,
  personnel: readonly Person[],
): PotentialSourceOwnership {
  const canonicalLabel = canonicalizeForAliasComparison(sourceAllocationLabel);
  if (canonicalLabel === "") return { kind: "unknown" };

  if (TEAM_ALIAS_CANONICAL_FORMS.has(canonicalLabel)) {
    return { kind: "team_alias" };
  }

  const { byFullName, byFirstName } = buildPersonNameIndex(personnel);

  const fullNameMatch = resolveUniqueMatch(byFullName.get(normalizeFullName(sourceAllocationLabel)));
  if (fullNameMatch) {
    return { kind: "team_person", personId: fullNameMatch.id };
  }

  if (KNOWN_EXTERNAL_LEADING_TOKENS.has(leadingToken(canonicalLabel))) {
    return { kind: "external" };
  }

  const shortNameMatch = resolveUniqueMatch(byFirstName.get(leadingToken(normalizeFullName(sourceAllocationLabel))));
  if (shortNameMatch) {
    return { kind: "team_person", personId: shortNameMatch.id };
  }

  return { kind: "unknown" };
}

/** True only for `team_alias`/`team_person` -- `external` and `unknown` are both excluded from Manager Overview's Potential scope (PR #16 §13, fail-closed). */
export function isManagerOwnedPotentialAllocation(
  sourceAllocationLabel: string,
  personnel: readonly Person[],
): boolean {
  const ownership = classifyPotentialSourceOwnership(sourceAllocationLabel, personnel);
  return ownership.kind === "team_alias" || ownership.kind === "team_person";
}
