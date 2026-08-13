import type { DutyFamily, Event, EventCertainty } from "./event";
import { BLOCKING_ABSENCE_KINDS } from "./operationalIssues";
import type { PotentialAllocation } from "./potentialAllocation";

/**
 * `partial` is kept as a real, forward-compatible status even though this
 * domain never produces it today — there is no honest partial-duty
 * semantic for any currently-mapped requirement family (a duty requirement
 * is either covered by a matching internal Event or it isn't). `covered`/
 * `missing` ARE produced now that the real requirement schema is known
 * (see `lib/parsers/potential.ts`'s `REQUIREMENT_COLUMNS`). `not_evaluable`
 * is reserved for a genuinely unknown/unsupported requirement family —
 * every family the parser currently emits is handled explicitly below.
 */
export type ManagerRequirementStatus = "covered" | "missing" | "partial" | "not_evaluable";

/** The known deterministic source-side conflict this domain can prove — never a fuzzy/aliased identity guess. */
export type ManagerSourceConflict = "blocking_absence";

export interface ManagerRequirementActualAssignee {
  personId: string;
  personName: string;
  certainty: EventCertainty;
}

export interface ManagerRequirementReconciliation {
  date: string;
  dutyFamily: DutyFamily;
  /** The exact internal slot this requirement was matched against (guard/reserve only). Null for every other family. */
  slot: number | null;
  columnLabel: string;
  /** The Potential cell's own honest text -- a source/organization label, or sometimes a named person. Never reinterpreted as the actual performer. */
  sourceAllocationLabel: string;
  resolvedSourcePersonId: string | null;
  /** Whether the internal schedule actually fulfills this requirement -- independent of who the SOURCE said would supply it. */
  status: ManagerRequirementStatus;
  /** Every internal Event that actually fulfills this requirement (usually 0 or 1; kept as an array so a genuine double-booking is never silently dropped). */
  actualAssignees: ManagerRequirementActualAssignee[];
  /**
   * Set only when `resolvedSourcePersonId` is non-null AND that person has
   * a blocking absence internally the same date (PR #14 §10/§15) --
   * deliberately independent of `status`: a requirement can be `covered`
   * by a replacement while STILL carrying a source conflict worth the
   * manager's attention, and a source conflict never by itself downgrades
   * an otherwise-covered requirement to `missing`.
   */
  sourceConflict: ManagerSourceConflict | null;
}

const EXACT_SLOT_FAMILIES: ReadonlySet<DutyFamily> = new Set(["guard", "reserve"]);
const SINGLE_FAMILIES: ReadonlySet<DutyFamily> = new Set(["evacuation_on_call"]);
const MULTIPLICITY_FAMILIES: ReadonlySet<DutyFamily> = new Set([
  "oxid",
  "daily_kitchen",
  "full_kitchen",
  "rasar",
]);

function hasBlockingAbsence(events: readonly Event[], personId: string, date: string): boolean {
  return events.some(
    (event) =>
      event.personId === personId &&
      event.date === date &&
      event.category === "absence" &&
      event.absenceKind !== null &&
      BLOCKING_ABSENCE_KINDS.has(event.absenceKind),
  );
}

function sourceConflictFor(
  allocation: PotentialAllocation,
  events: readonly Event[],
): ManagerSourceConflict | null {
  if (!allocation.resolvedSourcePersonId) return null;
  return hasBlockingAbsence(events, allocation.resolvedSourcePersonId, allocation.date) ? "blocking_absence" : null;
}

/** Deterministic tiebreak for pairing/matching internal Events -- personId first, then sourceSheet/sourceCell (never exposed on the output type). */
function stableEventOrder(a: Event, b: Event): number {
  if (a.personId !== b.personId) return a.personId < b.personId ? -1 : 1;
  if (a.sourceSheet !== b.sourceSheet) return a.sourceSheet < b.sourceSheet ? -1 : 1;
  return a.sourceCell < b.sourceCell ? -1 : a.sourceCell > b.sourceCell ? 1 : 0;
}

function toActualAssignee(event: Event): ManagerRequirementActualAssignee {
  return { personId: event.personId, personName: event.personName, certainty: event.certainty };
}

function buildResult(
  allocation: PotentialAllocation,
  matches: readonly Event[],
  allEvents: readonly Event[],
  status: ManagerRequirementStatus = matches.length > 0 ? "covered" : "missing",
): ManagerRequirementReconciliation {
  return {
    date: allocation.date,
    dutyFamily: allocation.dutyFamily,
    slot: allocation.slot,
    columnLabel: allocation.columnLabel,
    sourceAllocationLabel: allocation.sourceAllocationLabel,
    resolvedSourcePersonId: allocation.resolvedSourcePersonId,
    status,
    actualAssignees: matches.map(toActualAssignee),
    sourceConflict: sourceConflictFor(allocation, allEvents),
  };
}

interface AllocationGroup {
  date: string;
  dutyFamily: DutyFamily;
  allocations: PotentialAllocation[];
}

/**
 * Reconciles every Potential allocation against the internal `Event[]`.
 *
 * Coverage is determined by DATE + TYPED DUTY REQUIREMENT, never by
 * `sourceAllocationLabel` matching a person (PR #14 §6/§14):
 *
 * - `guard`/`reserve` (exact-slotted internally, see `event.ts`'s
 *   `GUARD_RE`/`RESERVE_RE`): matched by date + dutyFamily + the EXACT
 *   internal `Event.slot`.
 * - `evacuation_on_call` (single, unslotted): matched by date + dutyFamily.
 * - `oxid`/`daily_kitchen`/`full_kitchen`/`rasar` (internally unslotted,
 *   but numbered on the Potential side): reconciled by date + family
 *   MULTIPLICITY, never a fake exact-slot identity -- every requirement
 *   for that date+family is sorted by its own `sourceSlot` (Potential
 *   column order) and every matching internal Event is sorted by a stable
 *   internal order (`personId`, then `sourceSheet`/`sourceCell`), then
 *   paired positionally. A requirement with no event left to pair with is
 *   `"missing"`; a requirement with a paired event is `"covered"`. Never
 *   depends on input array order.
 *
 * `sourceConflict` (a named SOURCE person with a blocking absence the same
 * date) is computed independently of `status` -- a requirement covered by
 * a replacement internal performer stays `"covered"` even if its source
 * allocation conflicts with that named person's absence; both facts are
 * preserved on the same row for the UI to surface together.
 *
 * Pure: no network, no Date/UTC, never mutates its inputs. Preserves the
 * INPUT allocation order in its output (the parser's own deterministic
 * top-to-bottom/left-to-right order), regardless of internal grouping.
 */
export function reconcilePotentialAllocations(
  allocations: readonly PotentialAllocation[],
  events: readonly Event[],
): ManagerRequirementReconciliation[] {
  const groups = new Map<string, AllocationGroup>();
  for (const allocation of allocations) {
    const key = `${allocation.date} ${allocation.dutyFamily}`;
    let group = groups.get(key);
    if (!group) {
      group = { date: allocation.date, dutyFamily: allocation.dutyFamily, allocations: [] };
      groups.set(key, group);
    }
    group.allocations.push(allocation);
  }

  const resultByCell = new Map<string, ManagerRequirementReconciliation>();

  for (const group of groups.values()) {
    const internalEvents = events.filter(
      (event) => event.category === "duty" && event.dutyFamily === group.dutyFamily && event.date === group.date,
    );

    if (EXACT_SLOT_FAMILIES.has(group.dutyFamily)) {
      for (const allocation of group.allocations) {
        const matches = internalEvents.filter((event) => event.slot === allocation.slot).sort(stableEventOrder);
        resultByCell.set(allocation.sourceCell, buildResult(allocation, matches, events));
      }
      continue;
    }

    if (SINGLE_FAMILIES.has(group.dutyFamily)) {
      const matches = [...internalEvents].sort(stableEventOrder);
      for (const allocation of group.allocations) {
        resultByCell.set(allocation.sourceCell, buildResult(allocation, matches, events));
      }
      continue;
    }

    if (MULTIPLICITY_FAMILIES.has(group.dutyFamily)) {
      const sortedAllocations = [...group.allocations].sort(
        (a, b) => (a.sourceSlot ?? 0) - (b.sourceSlot ?? 0),
      );
      const sortedEvents = [...internalEvents].sort(stableEventOrder);

      sortedAllocations.forEach((allocation, index) => {
        const matched = sortedEvents[index];
        resultByCell.set(allocation.sourceCell, buildResult(allocation, matched ? [matched] : [], events));
      });
      continue;
    }

    // Genuinely unknown/unsupported requirement family -- defensive only; the parser never emits one today.
    for (const allocation of group.allocations) {
      resultByCell.set(allocation.sourceCell, buildResult(allocation, [], events, "not_evaluable"));
    }
  }

  return allocations.map((allocation) => resultByCell.get(allocation.sourceCell)!);
}
