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
  SearchResolution,
  SearchResultPerson,
  SearchShiftPeriod,
  ShiftSearchResult,
  SharedShiftSearchResult,
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

function resolveSharedShiftIntent(model: SearchReadModel, personQuery: string, raw: string): SearchResolution {
  const intent: SearchIntent = { kind: "shared_shift", personQuery, raw };
  const matches = findMatchingPeople(model.roster, personQuery).filter((person) => person.id !== model.meId);

  if (matches.length === 0) {
    return { intent, results: [], emptyMessage: `לא מצאנו איש/אשת צוות בשם "${personQuery}".` };
  }

  // Ambiguous: several distinct people match -- resolve (and show) all of them, never silently pick one.
  const candidates = matches.slice(0, MAX_PERSON_RESULTS).map((person) => ({
    person,
    shifts: findNextSharedShifts(model.shiftEvents, model.meId, person.id, MAX_SHARED_SHIFT_RESULTS),
  }));

  const results: SharedShiftSearchResult[] = candidates
    .filter((candidate) => candidate.shifts.length > 0)
    .map((candidate) => ({
      kind: "shared_shift",
      key: `shared_shift:${candidate.person.id}`,
      personName: candidate.person.name,
      shifts: candidate.shifts,
      href: scheduleHref(candidate.shifts[0].date),
    }));

  if (results.length === 0) {
    const message =
      matches.length === 1
        ? `אין לכם משמרת משותפת בתקופה הזמינה עם ${matches[0].name}.`
        : "אין לכם משמרת משותפת בתקופה הזמינה עם אף אחד מהם.";
    return { intent, results: [], emptyMessage: message };
  }

  return { intent, results, emptyMessage: null };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Resolves a parsed `SearchIntent` against the safe `SearchReadModel`
 * projection -- entirely pure, entirely client-safe (the model already
 * carries everything needed; no further server round trip). React renders
 * only the already-typed `GlobalSearchResult`s this returns, never a raw
 * domain object.
 */
export function resolveSearchIntent(intent: SearchIntent, model: SearchReadModel): SearchResolution {
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
      return resolveSharedShiftIntent(model, intent.personQuery, intent.raw);
  }
}
