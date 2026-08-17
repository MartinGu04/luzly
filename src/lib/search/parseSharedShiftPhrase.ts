import type { SearchPersonReference, SharedShiftPersonPair } from "./types";

/**
 * Recognizes the bounded set of natural Hebrew phrasings for "when are
 * these two people on the same shift?" and extracts which side of the pair
 * is the searching user themselves (structurally, via אני/לי/שלי) versus a
 * roster name to resolve later. Deterministic regex matching only -- no
 * NLP, no fuzzy scoring, no general Hebrew grammar framework. Person
 * resolution against the roster happens elsewhere (`resolveSearchIntent`);
 * this module only recognizes sentence SHAPE.
 *
 * Patterns are grouped self-first, then person+person, and within each
 * group most-specific-trigger-first (יש-ל.../המשמרת המשותפת... before the
 * fully generic "X עם Y"). This ordering is load-bearing, not cosmetic:
 *
 * - Self patterns must be tried before the generic person+person patterns,
 *   or "מתי אני ואיתי יחד" would be misread by the generic "X ו Y" shape
 *   as if "אני" were itself a literal person name.
 * - Within person+person, the "יש ל<A> משמרת ... עם <B>" pattern must be
 *   tried before the generic "<A> עם <B>" pattern, since the generic
 *   pattern's unanchored capture would otherwise swallow "יש ל<A> משמרת"
 *   whole as personA's query text.
 *
 * Every pattern returns a LIST of candidate `SharedShiftPersonPair`s
 * (almost always exactly one) rather than a single pair -- see the
 * person+person "<A> ו<B> יחד" pattern below for why.
 */

const SELF: SearchPersonReference = { kind: "self" };

function query(text: string | undefined): SearchPersonReference | null {
  const trimmed = text?.trim();
  return trimmed ? { kind: "query", text: trimmed } : null;
}

interface SharedShiftPattern {
  regex: RegExp;
  extract: (match: RegExpMatchArray) => SharedShiftPersonPair[] | null;
}

/** "יחד" / "ביחד" / "באותה משמרת" -- interchangeable ways to end a "<A> ו<B> ..." sentence. */
const TOGETHER_SUFFIX = "(?:ביחד|יחד|באותה\\s+משמרת)";

const SELF_PATTERNS: SharedShiftPattern[] = [
  // "מתי אני ואיתי יחד" / "...ביחד" / "...באותה משמרת"
  {
    regex: new RegExp(`^מתי\\s+אני\\s+ו(.+?)\\s+${TOGETHER_SUFFIX}$`),
    extract: (m) => {
      const personB = query(m[1]);
      return personB ? [{ personA: SELF, personB }] : null;
    },
  },
  // "מתי איתי ואני ביחד" / "...יחד"
  {
    regex: /^מתי\s+(.+?)\s+ואני\s+(?:ביחד|יחד)$/,
    extract: (m) => {
      const personA = query(m[1]);
      return personA ? [{ personA, personB: SELF }] : null;
    },
  },
  // Legacy phrasing carried over unchanged from the previous parser.
  {
    regex: /^מתי\s+אנחנו\s+יחד\s+(.+)$/,
    extract: (m) => {
      const personB = query(m[1]);
      return personB ? [{ personA: SELF, personB }] : null;
    },
  },
  // "מתי יש לי משמרת עם איתי" / "...ביחד עם..." / "...משותפת עם..."
  {
    regex: /^מתי\s+יש\s+לי\s+משמרת(?:\s+(?:ביחד|משותפת))?\s+עם\s+(.+)$/,
    extract: (m) => {
      const personB = query(m[1]);
      return personB ? [{ personA: SELF, personB }] : null;
    },
  },
  // "מתי המשמרת המשותפת שלי עם איתי"
  {
    regex: /^מתי\s+המשמרת\s+המשותפת\s+שלי\s+עם\s+(.+)$/,
    extract: (m) => {
      const personB = query(m[1]);
      return personB ? [{ personA: SELF, personB }] : null;
    },
  },
  // "מתי אני עם איתי" / "באיזה משמרת אני עם איתי" / "באיזו משמרת אני עם איתי"
  {
    regex: /^(?:מתי|באיזה\s+משמרת|באיזו\s+משמרת)\s+אני\s+עם\s+(.+)$/,
    extract: (m) => {
      const personB = query(m[1]);
      return personB ? [{ personA: SELF, personB }] : null;
    },
  },
];

/**
 * The generic "<A> ו<B> יחד/ביחד/באותה משמרת" shape is structurally
 * ambiguous whenever either name is itself multi-word and a LATER word
 * happens to start with "ו" -- e.g. "רוני וייס וגדעון" could mean
 * ("רוני", "וייס וגדעון") or ("רוני וייס", "גדעון"), and "טוביה וגדעון
 * וייס" could mean ("טוביה", "גדעון וייס") or ("טוביה וגדעון", "וייס").
 * Committing to the first (or last) "\s+ו" boundary is wrong for one of
 * these two shapes no matter which is chosen -- so every structural
 * boundary is preserved as its own candidate pair here, and the roster
 * (never shift/schedule data, see `resolveSearchIntent`) proves which one
 * is real.
 *
 * `middle` is the already-isolated text between "מתי " and the trailing
 * יחד/ביחד/באותה משמרת suffix.
 */
function splitConjunctionCandidates(middle: string): SharedShiftPersonPair[] | null {
  const candidates: SharedShiftPersonPair[] = [];
  const boundaryRe = /\s+ו/g;
  let boundary: RegExpExecArray | null;
  while ((boundary = boundaryRe.exec(middle)) !== null) {
    const personA = query(middle.slice(0, boundary.index));
    const personB = query(middle.slice(boundary.index + boundary[0].length));
    if (personA && personB) candidates.push({ personA, personB });
  }
  return candidates.length > 0 ? candidates : null;
}

const PERSON_PERSON_PATTERNS: SharedShiftPattern[] = [
  // "מתי <A> ו<B> יחד" / "...ביחד" / "...באותה משמרת" -- see
  // `splitConjunctionCandidates` for why this can yield more than one
  // candidate pair.
  {
    regex: new RegExp(`^מתי\\s+(.+)\\s+${TOGETHER_SUFFIX}$`),
    extract: (m) => splitConjunctionCandidates(m[1]),
  },
  // "מתי יש ל<A> משמרת עם <B>" / "...ביחד עם..." / "...משותפת עם..." -- the
  // ל is structurally OUTSIDE the capture group, never a generic strip.
  // The A/B boundary here is the literal word "משמרת", never "ו", so this
  // shape has no split ambiguity to preserve.
  {
    regex: /^מתי\s+יש\s+ל(.+?)\s+משמרת(?:\s+(?:ביחד|משותפת))?\s+עם\s+(.+)$/,
    extract: (m) => {
      const personA = query(m[1]);
      const personB = query(m[2]);
      return personA && personB ? [{ personA, personB }] : null;
    },
  },
  // "מתי <A> [יחד] עם <B>" -- most generic, tried last. Boundary is the
  // literal "עם", never "ו".
  {
    regex: /^מתי\s+(.+?)\s+(?:יחד\s+)?עם\s+(.+)$/,
    extract: (m) => {
      const personA = query(m[1]);
      const personB = query(m[2]);
      return personA && personB ? [{ personA, personB }] : null;
    },
  },
];

const ALL_PATTERNS = [...SELF_PATTERNS, ...PERSON_PERSON_PATTERNS];

/**
 * `normalized` must already be whitespace-collapsed/trimmed (see
 * `normalizeSearchQuery`) -- returns null when no shared-shift phrasing
 * shape matches, otherwise every structurally possible candidate pair
 * (almost always exactly one -- see `splitConjunctionCandidates`).
 */
export function parseSharedShiftPhrase(normalized: string): SharedShiftPersonPair[] | null {
  for (const pattern of ALL_PATTERNS) {
    const match = normalized.match(pattern.regex);
    if (!match) continue;
    const result = pattern.extract(match);
    if (result) return result;
  }
  return null;
}
