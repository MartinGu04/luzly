import { parseHebrewWeekdayName } from "@/lib/presentation/hebrewDate";
import { normalizeSearchQuery } from "./normalizeSearchQuery";
import type { SearchDateSpec, SearchIntent, SearchShiftPeriod } from "./types";

/** "19.8" / "19/8" / "19-8" -- day then month, no year (Israeli convention). Actual range validation happens at resolution (`resolveNearestCalendarDate`), never here. */
const EXPLICIT_DATE_RE = /^(\d{1,2})[./-](\d{1,2})$/;

const PERIOD_WORDS: Record<string, SearchShiftPeriod> = { "יום": "day", "לילה": "night" };
const FILLER_WORDS = new Set(["משמרת"]);

const SHARED_SHIFT_PATTERNS: RegExp[] = [
  /^מתי\s+אני\s+ו(.+?)\s+יחד$/,
  /^מתי\s+אנחנו\s+יחד\s+(.+)$/,
  /^מתי\s+אני\s+עם\s+(.+)$/,
];

// No `\b` word-boundary here -- JS regex `\b` is defined against `\w`
// (ASCII letters/digits/underscore only), so it never behaves correctly
// around Hebrew text. An explicit optional `\s+` before the captured tail
// does the same job unambiguously.
const WITH_ME_RE = /^מי\s+איתי(?:\s+(.*))?$/;

function parseExplicitDateToken(token: string): SearchDateSpec | null {
  const match = token.match(EXPLICIT_DATE_RE);
  if (!match) return null;
  return { kind: "explicit", day: Number(match[1]), month: Number(match[2]) };
}

/** A single leading Hebrew "ב" ("on"/"in") preposition, e.g. "בשבת" -> "שבת", "ב19.8" -> "19.8". */
function stripLeadingPreposition(token: string): string | null {
  return token.length > 1 && token.startsWith("ב") ? token.slice(1) : null;
}

interface TokenClassification {
  period: SearchShiftPeriod | null;
  date: SearchDateSpec | null;
  recognized: boolean;
}

/** Classifies one whitespace-split token as a period word, a weekday name, an explicit date, a filler word, or unrecognized -- trying the token as-is and, if that fails, with a leading "ב" stripped. */
function classifyToken(token: string): TokenClassification {
  const candidates = [token, stripLeadingPreposition(token)].filter(
    (candidate): candidate is string => candidate !== null,
  );

  for (const candidate of candidates) {
    if (FILLER_WORDS.has(candidate)) return { period: null, date: null, recognized: true };
    if (candidate in PERIOD_WORDS) return { period: PERIOD_WORDS[candidate], date: null, recognized: true };

    const weekdayIndex = parseHebrewWeekdayName(candidate);
    if (weekdayIndex !== null) return { period: null, date: { kind: "weekday", weekdayIndex }, recognized: true };

    const explicitDate = parseExplicitDateToken(candidate);
    if (explicitDate) return { period: null, date: explicitDate, recognized: true };
  }

  return { period: null, date: null, recognized: false };
}

interface ScannedTokens {
  period: SearchShiftPeriod | null;
  date: SearchDateSpec | null;
  allRecognized: boolean;
}

function scanTokens(text: string): ScannedTokens {
  const tokens = text.split(" ").filter((token) => token.length > 0);
  let period: SearchShiftPeriod | null = null;
  let date: SearchDateSpec | null = null;
  let allRecognized = true;

  for (const token of tokens) {
    const classification = classifyToken(token);
    if (!classification.recognized) {
      allRecognized = false;
      continue;
    }
    if (classification.period) period = classification.period;
    if (classification.date) date = classification.date;
  }

  return { period, date, allRecognized };
}

/**
 * Deterministic, rule-based intent parser -- no NLP, no fuzzy scoring.
 * Checks run in priority order so an explicit structured query always wins
 * over the generic person-name fallback (the app's own ranking rule): a
 * bare weekday compound like "יום חמישי" is recognized as ONE date token
 * before the looser per-token period+date scan (used for "shift"/"with_me")
 * ever runs, so "יום" is never misread there as the day-shift period word.
 *
 * Anchored patterns ("מי איתי ...", "מתי אני ו... יחד") are lenient about
 * their trailing date/period text -- an unrecognized tail still returns the
 * explicit intent (with a partial/absent date), never falls through to a
 * nonsense person search for "מי איתי" itself. The unanchored "shift"
 * pattern (a bare period+date combo with no trigger phrase) is strict: it
 * only matches when EVERY token is recognized, so an ordinary person query
 * that happens to contain "לילה" as a substring is never misread as a
 * shift query.
 */
export function parseSearchIntent(raw: string): SearchIntent {
  const normalized = normalizeSearchQuery(raw);
  if (normalized === "") return { kind: "empty" };

  const wholeWeekday = parseHebrewWeekdayName(normalized);
  if (wholeWeekday !== null) {
    return { kind: "date", date: { kind: "weekday", weekdayIndex: wholeWeekday }, raw: normalized };
  }

  const wholeExplicitDate = parseExplicitDateToken(normalized);
  if (wholeExplicitDate) {
    return { kind: "date", date: wholeExplicitDate, raw: normalized };
  }

  for (const pattern of SHARED_SHIFT_PATTERNS) {
    const match = normalized.match(pattern);
    const personQuery = match?.[1]?.trim();
    if (personQuery) {
      return { kind: "shared_shift", personQuery, raw: normalized };
    }
  }

  const withMeMatch = normalized.match(WITH_ME_RE);
  if (withMeMatch) {
    const rest = withMeMatch[1]?.trim() ?? "";
    const { period, date } = scanTokens(rest);
    return { kind: "with_me", date, period, raw: normalized };
  }

  const scanned = scanTokens(normalized);
  if (scanned.allRecognized && scanned.period && scanned.date) {
    return { kind: "shift", date: scanned.date, period: scanned.period, raw: normalized };
  }

  return { kind: "person", query: normalized };
}
