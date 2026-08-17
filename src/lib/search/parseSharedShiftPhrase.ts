import type { SearchPersonReference } from "./types";

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
 */

const SELF: SearchPersonReference = { kind: "self" };

function query(text: string | undefined): SearchPersonReference | null {
  const trimmed = text?.trim();
  return trimmed ? { kind: "query", text: trimmed } : null;
}

export interface SharedShiftPhraseMatch {
  personA: SearchPersonReference;
  personB: SearchPersonReference;
}

interface SharedShiftPattern {
  regex: RegExp;
  extract: (match: RegExpMatchArray) => SharedShiftPhraseMatch | null;
}

/** "יחד" / "ביחד" / "באותה משמרת" -- interchangeable ways to end a "<A> ו<B> ..." sentence. */
const TOGETHER_SUFFIX = "(?:ביחד|יחד|באותה\\s+משמרת)";

const SELF_PATTERNS: SharedShiftPattern[] = [
  // "מתי אני ואיתי יחד" / "...ביחד" / "...באותה משמרת"
  {
    regex: new RegExp(`^מתי\\s+אני\\s+ו(.+?)\\s+${TOGETHER_SUFFIX}$`),
    extract: (m) => {
      const personB = query(m[1]);
      return personB ? { personA: SELF, personB } : null;
    },
  },
  // "מתי איתי ואני ביחד" / "...יחד"
  {
    regex: /^מתי\s+(.+?)\s+ואני\s+(?:ביחד|יחד)$/,
    extract: (m) => {
      const personA = query(m[1]);
      return personA ? { personA, personB: SELF } : null;
    },
  },
  // Legacy phrasing carried over unchanged from the previous parser.
  {
    regex: /^מתי\s+אנחנו\s+יחד\s+(.+)$/,
    extract: (m) => {
      const personB = query(m[1]);
      return personB ? { personA: SELF, personB } : null;
    },
  },
  // "מתי יש לי משמרת עם איתי" / "...ביחד עם..." / "...משותפת עם..."
  {
    regex: /^מתי\s+יש\s+לי\s+משמרת(?:\s+(?:ביחד|משותפת))?\s+עם\s+(.+)$/,
    extract: (m) => {
      const personB = query(m[1]);
      return personB ? { personA: SELF, personB } : null;
    },
  },
  // "מתי המשמרת המשותפת שלי עם איתי"
  {
    regex: /^מתי\s+המשמרת\s+המשותפת\s+שלי\s+עם\s+(.+)$/,
    extract: (m) => {
      const personB = query(m[1]);
      return personB ? { personA: SELF, personB } : null;
    },
  },
  // "מתי אני עם איתי" / "באיזה משמרת אני עם איתי" / "באיזו משמרת אני עם איתי"
  {
    regex: /^(?:מתי|באיזה\s+משמרת|באיזו\s+משמרת)\s+אני\s+עם\s+(.+)$/,
    extract: (m) => {
      const personB = query(m[1]);
      return personB ? { personA: SELF, personB } : null;
    },
  },
];

const PERSON_PERSON_PATTERNS: SharedShiftPattern[] = [
  // "מתי <A> ו<B> יחד" / "...ביחד" / "...באותה משמרת"
  {
    regex: new RegExp(`^מתי\\s+(.+?)\\s+ו(.+?)\\s+${TOGETHER_SUFFIX}$`),
    extract: (m) => {
      const personA = query(m[1]);
      const personB = query(m[2]);
      return personA && personB ? { personA, personB } : null;
    },
  },
  // "מתי יש ל<A> משמרת עם <B>" / "...ביחד עם..." / "...משותפת עם..." -- the
  // ל is structurally OUTSIDE the capture group, never a generic strip.
  {
    regex: /^מתי\s+יש\s+ל(.+?)\s+משמרת(?:\s+(?:ביחד|משותפת))?\s+עם\s+(.+)$/,
    extract: (m) => {
      const personA = query(m[1]);
      const personB = query(m[2]);
      return personA && personB ? { personA, personB } : null;
    },
  },
  // "מתי <A> [יחד] עם <B>" -- most generic, tried last.
  {
    regex: /^מתי\s+(.+?)\s+(?:יחד\s+)?עם\s+(.+)$/,
    extract: (m) => {
      const personA = query(m[1]);
      const personB = query(m[2]);
      return personA && personB ? { personA, personB } : null;
    },
  },
];

const ALL_PATTERNS = [...SELF_PATTERNS, ...PERSON_PERSON_PATTERNS];

/** `normalized` must already be whitespace-collapsed/trimmed (see `normalizeSearchQuery`) -- returns null when no shared-shift phrasing shape matches. */
export function parseSharedShiftPhrase(normalized: string): SharedShiftPhraseMatch | null {
  for (const pattern of ALL_PATTERNS) {
    const match = normalized.match(pattern.regex);
    if (!match) continue;
    const result = pattern.extract(match);
    if (result) return result;
  }
  return null;
}
