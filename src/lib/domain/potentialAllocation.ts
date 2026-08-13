import type { DutyFamily } from "./event";

/**
 * One non-empty allocation cell from a Potential sheet's operational
 * table: a typed source/framework requirement for `date`, resolved via
 * the parser's verified header-label schema
 * (`lib/parsers/potential.ts`'s `REQUIREMENT_COLUMNS`). Deliberately NOT
 * an `Event` — Potential is the source/framework allocation, never the
 * internal actual schedule (see `README.md`'s Potential-vs-internal
 * note). Reconciliation against internal `Event[]` happens in
 * `potentialReconciliation.ts`, never in the parser.
 *
 * This type is domain-owned (not parser-owned) the same way `Event` is —
 * `lib/parsers/potential.ts` produces values of this shape, it doesn't
 * define the shape itself, matching the existing `Event`/`parseEvent`
 * convention. Domain never imports from `lib/parsers`.
 *
 * `sourceAllocationLabel` is the raw meaningful cell text (e.g. "סייבר",
 * "מבצעים", or sometimes a named person) — the source/organization
 * responsible for supplying the requirement, NOT automatically the actual
 * performer (that's determined by the internal schedule, in
 * reconciliation). `resolvedSourcePersonId` is set ONLY when that text
 * (whitespace-normalized) exactly equals a known `Person.name` — never a
 * fuzzy/partial match — and is optional context for a separate
 * named-source conflict check, never the basis for requirement coverage
 * itself.
 */
export interface PotentialAllocation {
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  dutyFamily: DutyFamily;
  /** Exact internal `Event.slot` to match (guard/reserve only). Null for every other family. */
  slot: number | null;
  /** The Potential column's own source ordering number (e.g. "אוקסיד 2" → 2). Null when the family has no numbering (evacuation_on_call). */
  sourceSlot: number | null;
  /** The requirement column's own header text, verbatim (e.g. "אוקסיד 2"). */
  columnLabel: string;
  sourceAllocationLabel: string;
  resolvedSourcePersonId: string | null;
  sourceSheet: string;
  sourceCell: string;
}
