import { dayOfWeek, daysBetweenCalendarDates, parseCalendarDate } from "./dutyBlocks";
import type { Event } from "./event";
import type { PotentialAllocation } from "./potentialAllocation";
import { EXACT_SLOT_FAMILIES } from "./potentialReconciliation";
import { scopeManagerPotentialAllocation } from "./potentialSourceOwnership";
import type { Person } from "./types";

/**
 * Turns Potential/תקשא"ס period allocations attributed to ONE person into
 * synthetic duty `Event`s, so `buildDutyBlocks` can group them exactly like
 * any real משמרות + תורנויות duty Event -- no separate grouping/
 * consecutive-day logic is reimplemented here, and no new `DutyBlock`
 * concept is introduced. The caller is expected to concatenate the result
 * with the person's own real duty Events before calling `buildDutyBlocks`.
 *
 * Person resolution reuses `scopeManagerPotentialAllocation` outright -- the
 * SAME generic source-ownership resolver Manager Overview already uses
 * (`lib/domain/potentialSourceOwnership.ts`). This is deliberately the
 * ONLY resolution path: never a name-based special case, and an ambiguous
 * short name never guesses (both already fail closed inside that
 * resolver, and are exercised again here only through it).
 *
 * An allocation is skipped when `personDutyEvents` already has a real duty
 * Event covering the exact same `(dutyFamily, slot)` -- the identity
 * `buildDutyBlocks` itself groups by, and the same slot convention
 * `potentialReconciliation.ts` already established (guard/reserve carry a
 * real internal slot; every other family is always `slot: null` on BOTH
 * the internal Event side and the Potential allocation side, per
 * `lib/parsers/potential.ts`'s `REQUIREMENT_COLUMNS`). This is what keeps a
 * normal department person's existing משמרות + תורנויות duties from ever
 * being duplicated: whenever their real duty already covers a slot, the
 * matching Potential allocation (if any) is silently dropped here rather
 * than becoming a second, redundant entry.
 *
 * For `dutyFamily`/`slot`, "the exact same" means the exact same DATE too --
 * EXCEPT for guard/reserve (`EXACT_SLOT_FAMILIES`, reused from
 * `potentialReconciliation.ts` rather than a second copy of the same
 * family list). For those two families specifically, the numbered slot
 * represents ONE continuous real-world requirement across its whole
 * half-week/week block, not a series of independent per-day requirements --
 * so a real internal duty anywhere in the SAME Sunday-Saturday calendar
 * week as the allocation's date already covers it, even on a different
 * exact date. This is what fixes a stale/superseded Potential entry from
 * BEFORE a real internal swap: e.g. Potential names a person for guard
 * slot 4 starting Sunday, but their real internal duty for that same slot
 * was later scheduled to start Tuesday of the SAME week (a swap) -- the
 * Sunday Potential entry is stale, not a genuine gap, and must never
 * surface as a second, phantom tentative duty. Every other family keeps
 * the original exact-date rule unchanged -- they carry no real internal
 * slot at all, so there is no "same continuous requirement" concept to
 * reconcile across dates for them.
 *
 * Certainty is always `"tentative"` -- a Potential allocation is the
 * source/framework plan, never a confirmed internal schedule entry (see
 * `potentialAllocation.ts`'s own docs), so it is never presented as
 * equally certain as a real parsed שיבוץ. `role`/`period` are structurally
 * meaningless for a duty (same convention `parseEvent` already uses for a
 * real duty Event), so both are set to their duty defaults (`null`/
 * `"unspecified"`) rather than guessed.
 */
export function buildPotentialDutyEvents(
  allocations: readonly PotentialAllocation[],
  person: Person,
  personnel: readonly Person[],
  personDutyEvents: readonly Event[],
): Event[] {
  const events: Event[] = [];

  for (const allocation of allocations) {
    const scoped = scopeManagerPotentialAllocation(allocation, personnel);
    if (!scoped || scoped.resolvedSourcePersonId !== person.id) continue;
    if (isAlreadyCoveredByInternalDuty(allocation, personDutyEvents)) continue;

    events.push({
      personId: person.id,
      personName: person.name,
      date: allocation.date,
      title: allocation.columnLabel,
      rawValue: allocation.sourceAllocationLabel,
      category: "duty",
      certainty: "tentative",
      role: null,
      period: "unspecified",
      sourceSheet: allocation.sourceSheet,
      sourceCell: allocation.sourceCell,
      slot: allocation.slot,
      shadow: false,
      startTimeOverride: null,
      endTimeOverride: null,
      changeNote: null,
      dutyFamily: allocation.dutyFamily,
      absenceKind: null,
    });
  }

  return events;
}

function isAlreadyCoveredByInternalDuty(
  allocation: PotentialAllocation,
  personDutyEvents: readonly Event[],
): boolean {
  return personDutyEvents.some((event) => {
    if (event.dutyFamily !== allocation.dutyFamily || event.slot !== allocation.slot) return false;
    if (EXACT_SLOT_FAMILIES.has(allocation.dutyFamily)) {
      return isSameCalendarWeek(event.date, allocation.date);
    }
    return event.date === allocation.date;
  });
}

/**
 * Whether `dateA`/`dateB` fall in the SAME Sunday-Saturday calendar week --
 * pure integer/local-calendar-date arithmetic (`dutyBlocks.ts`'s exported
 * `parseCalendarDate`/`dayOfWeek`/`daysBetweenCalendarDates`, never a
 * second date-math implementation, never `Date`/UTC). Two dates share a
 * week iff their day-count difference equals the difference between their
 * weekday indices (0=Sunday..6=Saturday) -- equivalent to both dates
 * having the same Sunday week-start, without ever constructing that
 * week-start date explicitly. An unparseable date never counts as
 * same-week (fails closed to `false`, same as every other date check in
 * this codebase).
 */
function isSameCalendarWeek(dateA: string, dateB: string): boolean {
  const a = parseCalendarDate(dateA);
  const b = parseCalendarDate(dateB);
  if (!a || !b) return false;

  const diffDays = daysBetweenCalendarDates(dateA, dateB);
  if (diffDays === null) return false;

  return diffDays === dayOfWeek(b) - dayOfWeek(a);
}

/**
 * The same conversion as `buildPotentialDutyEvents`, run once per person in
 * `people` and concatenated -- for a manager-facing, roster-wide projection
 * (e.g. `buildManagerDutyEntries`) that needs every attributed תקשא"ס duty
 * across the whole team, not just one person's own. Deliberately a thin
 * loop over the EXISTING per-person function -- resolution and dedup are
 * never re-implemented here, so a roster-wide caller and a single-person
 * caller (`buildPersonalScheduleReadModel.ts`) can never drift into two
 * different definitions of "attributed" or "already covered."
 */
export function buildPotentialDutyEventsForRoster(
  allocations: readonly PotentialAllocation[],
  people: readonly Person[],
  events: readonly Event[],
): Event[] {
  const eventsByPerson = new Map<string, Event[]>();
  for (const event of events) {
    const bucket = eventsByPerson.get(event.personId);
    if (bucket) bucket.push(event);
    else eventsByPerson.set(event.personId, [event]);
  }

  return people.flatMap((person) =>
    buildPotentialDutyEvents(allocations, person, people, eventsByPerson.get(person.id) ?? []),
  );
}
