import { resolveNearestCalendarDate, resolveNextWeekdayDate } from "@/lib/domain/dateRange";
import type { EventRole } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import { formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
import { roleLabel } from "@/lib/presentation/labels";
import { classifyPersonnelType } from "@/lib/domain/personnelType";
import { personnelTypeGroupLabel } from "@/lib/presentation/roster";
import type { SearchReadModel, SearchRosterPerson, SearchShiftEvent } from "@/lib/readModels/searchTypes";
import { findNextSharedShifts } from "./sharedShift";
import type {
  DateSearchResult,
  GlobalSearchResult,
  PersonSearchResult,
  SearchDateSpec,
  SearchIntent,
  SearchPersonReference,
  SearchResolution,
  SearchResultPerson,
  SearchShiftPeriod,
  ShiftSearchResult,
  SharedShiftDisambiguationResult,
  SharedShiftPersonPair,
  SharedShiftSearchResult,
  SharedShiftSplitDisambiguationResult,
  WithMeSearchResult,
} from "./types";

const MAX_PERSON_RESULTS = 8;
const MAX_SHARED_SHIFT_RESULTS = 3;
const UNRESOLVABLE_DATE_MESSAGE = "לא הצלחנו לזהות תאריך תקין.";

function resolveDateSpec(spec: SearchDateSpec, now: LocalNow): string | null {
  return spec.kind === "weekday"
    ? resolveNextWeekdayDate(spec.weekdayIndex, now)
    : resolveNearestCalendarDate(spec.day, spec.month, now);
}

function scheduleHref(date: string): string {
  return `/schedule?date=${date}`;
}

// ---------------------------------------------------------------------------
// Person matching -- exact > prefix > substring, case-insensitive (Hebrew
// has no case; this only matters for a Latin name). Never silently picks
// one candidate: every tier's matches are returned, just ranked.
// ---------------------------------------------------------------------------

type MatchTier = 0 | 1 | 2;

function matchTier(name: string, query: string): MatchTier | null {
  const normalizedName = name.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.includes(normalizedQuery)) return 2;
  return null;
}

function findMatchingPeople(roster: readonly SearchRosterPerson[], query: string): SearchRosterPerson[] {
  const scored = roster
    .map((person) => ({ person, tier: matchTier(person.name, query) }))
    .filter((entry): entry is { person: SearchRosterPerson; tier: MatchTier } => entry.tier !== null);

  scored.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : a.person.name < b.person.name ? -1 : 1));
  return scored.map((entry) => entry.person);
}

// ---------------------------------------------------------------------------
// Shift-event lookups over the safe SearchReadModel projection
// ---------------------------------------------------------------------------

function roleFor(person: Pick<SearchRosterPerson, "isSupervisor" | "isTechnician">): EventRole {
  if (person.isSupervisor) return "supervisor";
  if (person.isTechnician) return "technician";
  return null;
}

function currentShiftFor(shiftEvents: readonly SearchShiftEvent[], personId: string): SearchShiftEvent | null {
  return shiftEvents.find((event) => event.personId === personId && event.temporalState === "current") ?? null;
}

/** `shiftEvents` is already sorted (date, period, personId) ascending -- the first upcoming match is the earliest one. */
function nextShiftFor(shiftEvents: readonly SearchShiftEvent[], personId: string): SearchShiftEvent | null {
  return shiftEvents.find((event) => event.personId === personId && event.temporalState === "upcoming") ?? null;
}

/** Everyone (any role) staffed on `date`+`period`, one row per distinct person -- mirrors `buildShiftRoster`'s "who else is on this shift" semantics over the safe projection, optionally excluding one person (the searching user, for "with me"). */
function peopleOnShift(
  shiftEvents: readonly SearchShiftEvent[],
  roster: readonly SearchRosterPerson[],
  date: string,
  period: SearchShiftPeriod,
  excludePersonId: string | null,
): SearchResultPerson[] {
  const rosterById = new Map(roster.map((person) => [person.id, person]));
  const seen = new Set<string>();
  const people: SearchResultPerson[] = [];

  for (const event of shiftEvents) {
    if (event.date !== date || event.period !== period) continue;
    if (excludePersonId !== null && event.personId === excludePersonId) continue;
    if (seen.has(event.personId)) continue;
    const person = rosterById.get(event.personId);
    if (!person) continue;
    seen.add(event.personId);
    people.push({ personId: person.id, name: person.name, role: event.role, shadow: event.shadow });
  }

  return people;
}

// ---------------------------------------------------------------------------
// Per-intent resolvers
// ---------------------------------------------------------------------------

function resolvePersonIntent(model: SearchReadModel, query: string): GlobalSearchResult[] {
  return findMatchingPeople(model.roster, query)
    .slice(0, MAX_PERSON_RESULTS)
    .map((person) => toPersonResult(model, person));
}

function toPersonResult(model: SearchReadModel, person: SearchRosterPerson): PersonSearchResult {
  const isSelf = person.id === model.meId;
  const current = currentShiftFor(model.shiftEvents, person.id);
  const next = nextShiftFor(model.shiftEvents, person.id);
  const nextShared = isSelf ? null : (findNextSharedShifts(model.shiftEvents, model.meId, person.id, 1)[0] ?? null);

  // Only a shared shift is a genuinely navigable destination: that date
  // exists on the VIEWER's own calendar. `/schedule` for a normal
  // authenticated user is always the viewer's self-only calendar, so
  // sending them to this person's own (unshared) next-shift date would
  // silently open the viewer's own unrelated day, misrepresenting what the
  // result actually means. A person result with no shared shift stays
  // purely informational (`href: null`) -- `nextShift` is still shown, just
  // never as a navigation target.
  const href = nextShared ? scheduleHref(nextShared.date) : null;

  return {
    kind: "person",
    key: `person:${person.id}`,
    personId: person.id,
    name: person.name,
    roleLabel: roleLabel(roleFor(person)),
    personnelTypeLabel: personnelTypeGroupLabel(classifyPersonnelType(person.personnelType)),
    isSelf,
    currentShift: current ? { period: current.period } : null,
    nextShift: next ? { date: next.date, period: next.period } : null,
    nextSharedShift: nextShared,
    href,
  };
}

function resolveDateIntent(spec: SearchDateSpec, raw: string, now: LocalNow): SearchResolution {
  const intent: SearchIntent = { kind: "date", date: spec, raw };
  const date = resolveDateSpec(spec, now);
  if (!date) return { intent, results: [], emptyMessage: UNRESOLVABLE_DATE_MESSAGE };

  const label = formatHebrewWeekdayAndDate(date) ?? date;
  const result: DateSearchResult = { kind: "date", key: `date:${date}`, date, label, href: scheduleHref(date) };
  return { intent, results: [result], emptyMessage: null };
}

function resolveShiftIntent(
  model: SearchReadModel,
  spec: SearchDateSpec,
  period: SearchShiftPeriod,
  raw: string,
): SearchResolution {
  const intent: SearchIntent = { kind: "shift", date: spec, period, raw };
  const date = resolveDateSpec(spec, model.localNow);
  if (!date) return { intent, results: [], emptyMessage: UNRESOLVABLE_DATE_MESSAGE };

  const label = `${formatHebrewWeekdayAndDate(date) ?? date} · ${period === "day" ? "יום" : "לילה"}`;
  const people = peopleOnShift(model.shiftEvents, model.roster, date, period, null);
  const result: ShiftSearchResult = {
    kind: "shift",
    key: `shift:${date}:${period}`,
    date,
    period,
    label,
    people,
    href: scheduleHref(date),
  };
  return { intent, results: [result], emptyMessage: null };
}

function resolveWithMeIntent(
  model: SearchReadModel,
  spec: SearchDateSpec | null,
  period: SearchShiftPeriod | null,
  raw: string,
): SearchResolution {
  const intent: SearchIntent = { kind: "with_me", date: spec, period, raw };
  const date = spec ? resolveDateSpec(spec, model.localNow) : model.localNow.date;
  if (!date) return { intent, results: [], emptyMessage: UNRESOLVABLE_DATE_MESSAGE };

  const myShiftsThatDate = model.shiftEvents.filter(
    (event) => event.personId === model.meId && event.date === date && (period ? event.period === period : true),
  );

  if (myShiftsThatDate.length === 0) {
    const dateLabel = formatHebrewWeekdayAndDate(date) ?? date;
    return { intent, results: [], emptyMessage: `אין לך משמרת ב${dateLabel}.` };
  }

  const results: WithMeSearchResult[] = myShiftsThatDate.map((myShift) => ({
    kind: "with_me",
    key: `with_me:${myShift.date}:${myShift.period}`,
    date: myShift.date,
    period: myShift.period,
    people: peopleOnShift(model.shiftEvents, model.roster, myShift.date, myShift.period, model.meId),
    href: scheduleHref(myShift.date),
  }));

  return { intent, results, emptyMessage: null };
}

/**
 * Choices already made by the searching user while resolving a
 * `shared_shift` question -- the UI owns clearing this whenever the query
 * itself changes, so a stale choice can never survive into a new,
 * unrelated question.
 */
export interface SharedShiftOverrides {
  /** Which structural sentence split was picked (see `SharedShiftSplitDisambiguationResult`) -- resolved BEFORE personA/personB, since it decides what those texts even are. */
  splitChoice?: { personAText: string; personBText: string };
  /** Resolved personIds for A/B, set once an ambiguous-NAME candidate is picked (see `SharedShiftDisambiguationResult`). */
  personA?: string;
  personB?: string;
}

function personReferenceText(ref: SearchPersonReference): string | null {
  return ref.kind === "query" ? ref.text : null;
}

function personReferenceHasAnyRosterMatch(model: SearchReadModel, ref: SearchPersonReference): boolean {
  if (ref.kind === "self") return true;
  return findMatchingPeople(model.roster, ref.text).length > 0;
}

type ChosenPairResolution =
  | { status: "resolved"; pair: SharedShiftPersonPair }
  | { status: "ambiguous"; candidates: SharedShiftPersonPair[] };

/**
 * Picks which structural sentence split to resolve against, when the
 * parser preserved more than one (see `splitConjunctionCandidates`).
 * NEVER consults `model.shiftEvents` -- identity/segmentation resolution
 * must stay entirely independent of whether a candidate pair happens to
 * share a shift. A split counts as "valid" only when BOTH of its texts
 * match at least one real roster person (via the same `findMatchingPeople`
 * exact/prefix/substring matcher every other search intent uses); exactly
 * one valid split proceeds automatically, more than one is surfaced as a
 * typed choice, and zero valid splits fall back to the first structural
 * candidate so per-side resolution can still report a clear not-found
 * message rather than silently guessing a real match.
 */
function choosePersonPair(
  model: SearchReadModel,
  candidates: SharedShiftPersonPair[],
  overrides: SharedShiftOverrides,
): ChosenPairResolution {
  if (overrides.splitChoice) {
    const chosen = candidates.find(
      (pair) =>
        personReferenceText(pair.personA) === overrides.splitChoice?.personAText &&
        personReferenceText(pair.personB) === overrides.splitChoice?.personBText,
    );
    if (chosen) return { status: "resolved", pair: chosen };
  }

  if (candidates.length === 1) return { status: "resolved", pair: candidates[0] };

  const validSplits = candidates.filter(
    (pair) =>
      personReferenceHasAnyRosterMatch(model, pair.personA) && personReferenceHasAnyRosterMatch(model, pair.personB),
  );

  if (validSplits.length === 1) return { status: "resolved", pair: validSplits[0] };
  if (validSplits.length > 1) return { status: "ambiguous", candidates: validSplits };
  return { status: "resolved", pair: candidates[0] };
}

function buildSplitDisambiguationResults(candidates: SharedShiftPersonPair[]): SharedShiftSplitDisambiguationResult[] {
  return candidates.map((pair, index) => {
    const personAText = personReferenceText(pair.personA) ?? "";
    const personBText = personReferenceText(pair.personB) ?? "";
    return {
      kind: "shared_shift_split_disambiguation",
      key: `shared_shift_split_disambiguation:${index}:${personAText}:${personBText}`,
      personAText,
      personBText,
      href: null,
    };
  });
}

type PersonSideResolution =
  | { status: "resolved"; personId: string }
  | { status: "ambiguous"; query: string; candidates: SearchRosterPerson[] }
  | { status: "not_found"; query: string };

/**
 * Resolves one side of a `shared_shift` pair. `self` always resolves
 * directly to the searching user -- it can never be ambiguous or
 * not-found. A `query` reference prefers an explicit override (the
 * personId the user already picked to resolve an earlier ambiguity) over
 * re-matching the roster, so a disambiguation choice sticks even if it
 * happens to still be a multi-match query text. Matching itself reuses
 * `findMatchingPeople` -- the exact same exact/prefix/substring roster
 * matching every other search intent uses; never a second matching
 * strategy, never resolved by consulting shift data.
 */
function resolvePersonSide(
  model: SearchReadModel,
  ref: SearchPersonReference,
  overridePersonId: string | undefined,
): PersonSideResolution {
  if (ref.kind === "self") return { status: "resolved", personId: model.meId };
  if (overridePersonId) return { status: "resolved", personId: overridePersonId };

  const matches = findMatchingPeople(model.roster, ref.text);
  if (matches.length === 0) return { status: "not_found", query: ref.text };
  if (matches.length === 1) return { status: "resolved", personId: matches[0].id };
  return { status: "ambiguous", query: ref.text, candidates: matches.slice(0, MAX_PERSON_RESULTS) };
}

function buildDisambiguationResults(
  side: "A" | "B",
  resolution: { query: string; candidates: SearchRosterPerson[] },
): SharedShiftDisambiguationResult[] {
  return resolution.candidates.map((person) => ({
    kind: "shared_shift_disambiguation",
    key: `shared_shift_disambiguation:${side}:${person.id}`,
    side,
    query: resolution.query,
    personId: person.id,
    name: person.name,
    roleLabel: roleLabel(roleFor(person)),
    personnelTypeLabel: personnelTypeGroupLabel(classifyPersonnelType(person.personnelType)),
    href: null,
  }));
}

function resolveSharedShiftIntent(
  model: SearchReadModel,
  candidates: SharedShiftPersonPair[],
  raw: string,
  overrides: SharedShiftOverrides,
): SearchResolution {
  const intent: SearchIntent = { kind: "shared_shift", candidates, raw };

  // Which sentence split to resolve against is decided FIRST -- purely
  // from the roster, never from shift data -- before any per-side
  // name-ambiguity resolution even begins.
  const chosenPair = choosePersonPair(model, candidates, overrides);
  if (chosenPair.status === "ambiguous") {
    return { intent, results: buildSplitDisambiguationResults(chosenPair.candidates), emptyMessage: null };
  }
  const { personA: personARef, personB: personBRef } = chosenPair.pair;

  // Disambiguation always proceeds one side at a time, A before B -- never
  // a combinatorial guess across two simultaneously-ambiguous references.
  const sideA = resolvePersonSide(model, personARef, overrides.personA);
  if (sideA.status === "ambiguous") {
    return { intent, results: buildDisambiguationResults("A", sideA), emptyMessage: null };
  }
  if (sideA.status === "not_found") {
    return { intent, results: [], emptyMessage: `לא מצאנו איש/אשת צוות בשם "${sideA.query}".` };
  }

  const sideB = resolvePersonSide(model, personBRef, overrides.personB);
  if (sideB.status === "ambiguous") {
    return { intent, results: buildDisambiguationResults("B", sideB), emptyMessage: null };
  }
  if (sideB.status === "not_found") {
    return { intent, results: [], emptyMessage: `לא מצאנו איש/אשת צוות בשם "${sideB.query}".` };
  }

  if (sideA.personId === sideB.personId) {
    return { intent, results: [], emptyMessage: "לא ניתן לחפש משמרת משותפת של אותו אדם עם עצמו." };
  }

  const rosterById = new Map(model.roster.map((person) => [person.id, person]));
  const personA = rosterById.get(sideA.personId);
  const personB = rosterById.get(sideB.personId);
  if (!personA || !personB) {
    return { intent, results: [], emptyMessage: "לא מצאנו את אחד/אחת מהם ברשימת הצוות." };
  }

  const isSelfA = sideA.personId === model.meId;
  const isSelfB = sideB.personId === model.meId;
  const involvesSelf = isSelfA || isSelfB;

  const shifts = findNextSharedShifts(model.shiftEvents, sideA.personId, sideB.personId, MAX_SHARED_SHIFT_RESULTS);

  if (shifts.length === 0) {
    const message = involvesSelf
      ? `אין לכם משמרת משותפת בתקופה הזמינה עם ${isSelfA ? personB.name : personA.name}.`
      : `לא נמצאה משמרת משותפת בתקופה הזמינה עבור ${personA.name} ו${personB.name}.`;
    return { intent, results: [], emptyMessage: message };
  }

  // Navigable only when the searching user is one of the two -- that date
  // is genuinely on THEIR /schedule calendar. An arbitrary other+other
  // pair stays purely informational: `/schedule` always shows the
  // viewer's own calendar, so sending them there for a pair that doesn't
  // include them would misleadingly present it as if it did.
  const result: SharedShiftSearchResult = {
    kind: "shared_shift",
    key: `shared_shift:${sideA.personId}:${sideB.personId}`,
    personA: { personId: sideA.personId, name: personA.name, isSelf: isSelfA },
    personB: { personId: sideB.personId, name: personB.name, isSelf: isSelfB },
    shifts,
    href: involvesSelf ? scheduleHref(shifts[0].date) : null,
  };

  return { intent, results: [result], emptyMessage: null };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const NO_OVERRIDES: SharedShiftOverrides = {};

/**
 * Resolves a parsed `SearchIntent` against the safe `SearchReadModel`
 * projection -- entirely pure, entirely client-safe (the model already
 * carries everything needed; no further server round trip). React renders
 * only the already-typed `GlobalSearchResult`s this returns, never a raw
 * domain object.
 *
 * `overrides` only ever affects `shared_shift` resolution -- the personIds
 * the searching user has already picked to resolve an earlier ambiguous
 * name, owned and cleared by the UI (see `CommandPalette`) whenever the
 * query text itself changes.
 */
export function resolveSearchIntent(
  intent: SearchIntent,
  model: SearchReadModel,
  overrides: SharedShiftOverrides = NO_OVERRIDES,
): SearchResolution {
  switch (intent.kind) {
    case "empty":
      return { intent, results: [], emptyMessage: null };
    case "person":
      return { intent, results: resolvePersonIntent(model, intent.query), emptyMessage: null };
    case "date":
      return resolveDateIntent(intent.date, intent.raw, model.localNow);
    case "shift":
      return resolveShiftIntent(model, intent.date, intent.period, intent.raw);
    case "with_me":
      return resolveWithMeIntent(model, intent.date, intent.period, intent.raw);
    case "shared_shift":
      return resolveSharedShiftIntent(model, intent.candidates, intent.raw, overrides);
  }
}
