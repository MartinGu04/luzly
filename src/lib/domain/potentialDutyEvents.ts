import type { Event } from "./event";
import type { PotentialAllocation } from "./potentialAllocation";
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
 * Event for the exact same `(date, dutyFamily, slot)` -- the identity
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
  return personDutyEvents.some(
    (event) =>
      event.date === allocation.date &&
      event.dutyFamily === allocation.dutyFamily &&
      event.slot === allocation.slot,
  );
}
