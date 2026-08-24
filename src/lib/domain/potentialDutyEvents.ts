import { buildDutyBlocks, dayOfWeek, daysBetweenCalendarDates, parseCalendarDate, type DutyBlock } from "./dutyBlocks";
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
 * family list). The real workbook can carry TWO distinct guard/reserve
 * requirements for the SAME slot in the SAME week (e.g. a first-half and a
 * second-half half-week block are each their own row) -- so a numbered
 * slot is NOT one continuous requirement per week; it is per REAL,
 * distinguishable confirmed block. Reconciliation for these two families is
 * therefore one-to-one, via `resolveCoveredPersonalAllocations` below: each
 * real confirmed `DutyBlock` for that `(dutyFamily, slot)` may supersede AT
 * MOST ONE Potential allocation, matched by exact date first, then -- for
 * whichever allocations and blocks are still unmatched after that -- by
 * falling in the SAME Sunday-Saturday calendar week. This is what fixes a
 * stale/superseded Potential entry from BEFORE a real internal swap (e.g.
 * Potential names a person for guard slot 4 starting Sunday, but their real
 * internal duty for that same slot was later moved to start Tuesday of the
 * SAME week) WITHOUT letting that one real block also swallow a genuinely
 * separate, still-unfulfilled Potential requirement elsewhere in that same
 * week (e.g. the OTHER half-week's own slot-4 allocation). Every other
 * family keeps the original independent exact-date rule unchanged -- they
 * carry no real internal slot at all, so there is no per-block identity to
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
  const personAllocations: PotentialAllocation[] = [];
  for (const allocation of allocations) {
    const scoped = scopeManagerPotentialAllocation(allocation, personnel);
    if (!scoped || scoped.resolvedSourcePersonId !== person.id) continue;
    personAllocations.push(allocation);
  }

  const covered = resolveCoveredPersonalAllocations(personAllocations, personDutyEvents);

  const events: Event[] = [];
  for (const allocation of personAllocations) {
    if (covered.has(allocation)) continue;

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

/**
 * Which of `personAllocations` (already resolved/scoped to ONE person) are
 * already fulfilled by a real internal duty, and must never be synthesized.
 *
 * Non-slotted families (everything except guard/reserve, `EXACT_SLOT_FAMILIES`):
 * unchanged, independent per-allocation exact-date matching -- these carry
 * no real internal slot at all (`slot: null` on both sides), so there is no
 * per-block identity to consume; one real event can validly correspond to
 * more than one same-date allocation without any bookkeeping.
 *
 * Guard/reserve: reconciled one-to-one per `(dutyFamily, slot)`, via
 * `resolveCoveredSlottedAllocations` -- see that function's own docs for
 * why a simple "is there ANY matching real event/week" boolean predicate is
 * unsafe once the SAME slot can carry two distinct real-world requirements
 * in the same week (the real workbook does: a first-half and a second-half
 * block are each their own row).
 */
function resolveCoveredPersonalAllocations(
  personAllocations: readonly PotentialAllocation[],
  personDutyEvents: readonly Event[],
): ReadonlySet<PotentialAllocation> {
  const covered = new Set<PotentialAllocation>();
  const slottedByFamilyAndSlot = new Map<string, PotentialAllocation[]>();

  for (const allocation of personAllocations) {
    if (!EXACT_SLOT_FAMILIES.has(allocation.dutyFamily)) {
      const isCovered = personDutyEvents.some(
        (event) =>
          event.dutyFamily === allocation.dutyFamily &&
          event.slot === allocation.slot &&
          event.date === allocation.date,
      );
      if (isCovered) covered.add(allocation);
      continue;
    }

    const key = `${allocation.dutyFamily}|${allocation.slot ?? ""}`;
    const group = slottedByFamilyAndSlot.get(key);
    if (group) group.push(allocation);
    else slottedByFamilyAndSlot.set(key, [allocation]);
  }

  if (slottedByFamilyAndSlot.size > 0) {
    const confirmedBlocks = buildDutyBlocks(personDutyEvents);

    for (const groupAllocations of slottedByFamilyAndSlot.values()) {
      const { dutyFamily, slot } = groupAllocations[0];
      const blocks = confirmedBlocks.filter((block) => block.dutyFamily === dutyFamily && block.slot === slot);
      for (const allocation of resolveCoveredSlottedAllocations(groupAllocations, blocks)) {
        covered.add(allocation);
      }
    }
  }

  return covered;
}

/**
 * One-to-one reconciliation for ONE guard/reserve `(dutyFamily, slot)`
 * group: which of `allocations` (all sharing that family/slot, for one
 * person) are already fulfilled by one of `blocks` (that same person's
 * REAL confirmed `DutyBlock`s for that SAME family/slot, built via
 * `buildDutyBlocks` -- never a second grouping implementation). A block may
 * cover AT MOST ONE allocation: the real workbook can carry two distinct
 * requirements for the same slot in the same week (a first-half and a
 * second-half block), so letting one real block silently satisfy EVERY
 * allocation sharing its week (this reconciliation's earlier, unsafe
 * shape -- a bare `.some(...)` predicate with no consumption tracking)
 * would wrongly drop a genuinely still-open second requirement.
 *
 * Two passes, in this fixed order -- exact date always wins first, so a
 * block that genuinely matches one allocation's exact date can never be
 * "stolen" by a same-week fuzzy match for a DIFFERENT allocation processed
 * earlier:
 *
 * 1. EXACT DATE: an allocation is covered by the (at most one) still
 *    -unconsumed block whose real dates include the allocation's exact
 *    date.
 * 2. SAME CALENDAR WEEK: for whatever remains unmatched after pass 1, an
 *    allocation is covered by the first still-unconsumed block sharing its
 *    Sunday-Saturday week (`isSameCalendarWeek`, checked against EVERY one
 *    of the block's real dates, not just its `startDate` -- a block can
 *    itself span a week boundary, e.g. a real 4-day weekend block). This is
 *    the stale/superseded-Potential-entry case: a real internal swap moved
 *    the same logical requirement to a different date within the same
 *    week.
 *
 * Both passes process `allocations` in a stable (date, then sourceSheet/
 * sourceCell) order, and `blocks` in their own already-startDate-sorted
 * order (per `buildDutyBlocks`) -- deterministic regardless of input order,
 * never left to incidental Map/array iteration order.
 */
function resolveCoveredSlottedAllocations(
  allocations: readonly PotentialAllocation[],
  blocks: readonly DutyBlock[],
): PotentialAllocation[] {
  const sortedAllocations = [...allocations].sort(compareAllocationsForReconciliation);
  const consumedBlockIndices = new Set<number>();
  const covered: PotentialAllocation[] = [];

  for (const allocation of sortedAllocations) {
    const blockIndex = blocks.findIndex(
      (block, index) => !consumedBlockIndices.has(index) && block.dates.includes(allocation.date),
    );
    if (blockIndex === -1) continue;
    consumedBlockIndices.add(blockIndex);
    covered.push(allocation);
  }

  const coveredByExactDate = new Set(covered);

  for (const allocation of sortedAllocations) {
    if (coveredByExactDate.has(allocation)) continue;

    const blockIndex = blocks.findIndex(
      (block, index) =>
        !consumedBlockIndices.has(index) && block.dates.some((date) => isSameCalendarWeek(date, allocation.date)),
    );
    if (blockIndex === -1) continue;
    consumedBlockIndices.add(blockIndex);
    covered.push(allocation);
  }

  return covered;
}

/** Deterministic tiebreak for reconciling allocations -- date first, then the same sourceSheet/sourceCell identity `potentialReconciliation.ts`'s `allocationIdentity` already uses. */
function compareAllocationsForReconciliation(a: PotentialAllocation, b: PotentialAllocation): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.sourceSheet !== b.sourceSheet) return a.sourceSheet < b.sourceSheet ? -1 : 1;
  return a.sourceCell < b.sourceCell ? -1 : a.sourceCell > b.sourceCell ? 1 : 0;
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
