import type { EventRole } from "@/lib/domain/event";

export type SearchShiftPeriod = "day" | "night";

/** An unresolved date reference from a parsed query -- resolved against `LocalNow` only at the resolution step, never here. */
export type SearchDateSpec =
  | { kind: "explicit"; day: number; month: number }
  | { kind: "weekday"; weekdayIndex: number };

/**
 * The deterministic, rule-based parse of a normalized query -- never
 * inferred from fuzzy scoring. Exactly one intent per query; an explicit
 * structured pattern (with_me/shared_shift/shift/date) always wins over
 * the generic `person` fallback, see `parseSearchIntent`.
 */
export type SearchIntent =
  | { kind: "empty" }
  | { kind: "person"; query: string }
  | { kind: "date"; date: SearchDateSpec; raw: string }
  | { kind: "shift"; date: SearchDateSpec; period: SearchShiftPeriod; raw: string }
  | { kind: "with_me"; date: SearchDateSpec | null; period: SearchShiftPeriod | null; raw: string }
  | { kind: "shared_shift"; personQuery: string; raw: string };

/** A colleague appearing in a shift/with-me result -- never more than name/role/shadow, the same fields `PersonalCounterpart` already exposes. */
export interface SearchResultPerson {
  personId: string;
  name: string;
  role: EventRole;
  shadow: boolean;
}

export interface PersonSearchResult {
  kind: "person";
  key: string;
  personId: string;
  name: string;
  roleLabel: string | null;
  personnelTypeLabel: string;
  /** True when this result is the searching user's own roster entry -- "shared shift with you" has no meaning against yourself, so the UI never shows a shared-shift line (positive or "none found") for it. */
  isSelf: boolean;
  /** Set only while the person is actually mid-shift right now. */
  currentShift: { period: SearchShiftPeriod } | null;
  /** The person's own next upcoming shift, if any is within the search data window. Rendered as THEIR shift, never the viewer's -- easy to misread as "next shift together" if not labeled distinctly (see `CommandPalette`). */
  nextShift: { date: string; period: SearchShiftPeriod } | null;
  /** The next shift where the searching user and this person are BOTH staffed. Never set for `isSelf`. */
  nextSharedShift: { date: string; period: SearchShiftPeriod } | null;
  /** Navigable only when a next shared shift exists to jump to (that date is on the VIEWER's own calendar); null for a purely informational card otherwise -- never the person's own unshared next shift. */
  href: string | null;
}

export interface DateSearchResult {
  kind: "date";
  key: string;
  date: string;
  label: string;
  href: string;
}

export interface ShiftSearchResult {
  kind: "shift";
  key: string;
  date: string;
  period: SearchShiftPeriod;
  label: string;
  people: SearchResultPerson[];
  href: string;
}

export interface SharedShiftSearchResult {
  kind: "shared_shift";
  key: string;
  personName: string;
  /** Next few shared shifts, soonest first -- never just one when more exist, but kept short (see `resolveSearchIntent`). */
  shifts: { date: string; period: SearchShiftPeriod }[];
  href: string | null;
}

export interface WithMeSearchResult {
  kind: "with_me";
  key: string;
  date: string;
  period: SearchShiftPeriod;
  people: SearchResultPerson[];
  href: string;
}

export type GlobalSearchResult =
  | PersonSearchResult
  | DateSearchResult
  | ShiftSearchResult
  | SharedShiftSearchResult
  | WithMeSearchResult;

export interface SearchResolution {
  intent: SearchIntent;
  results: GlobalSearchResult[];
  /** Set only when there's a specific, tasteful explanation for zero results to an EXPLICIT question (with_me/shared_shift/an unparseable date) -- the UI supplies its own generic "no matches" copy whenever this is null and results are empty, never invented here for an ordinary person/date query. */
  emptyMessage: string | null;
}
