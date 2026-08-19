import { buildDutyBlocks, dayOfWeek, parseCalendarDate, type DutyBlock } from "./dutyBlocks";
import type { DutyFamily, Event } from "./event";

/**
 * "הקצאות שבוצעו" -- the canonical, business-confirmed allocation-weight
 * rules for how much real completed duty work is actually "worth", per
 * duty family. This is DELIBERATELY separate from `currentScore` (the
 * workbook's own opaque Fairness score, `lib/domain/fairnessAnalysis.ts`) --
 * that value is parsed straight off the Potential sheet's "טבלת צדק" table
 * and reflects Google Sheet formulas מי-מה-מו never sees at runtime, while
 * this module derives a genuinely independent factual total purely from
 * real schedule `Event`s. Neither value is derived from the other, and
 * neither ever overwrites the other -- see `buildDutyFairnessReadModel.ts`'s
 * own docs for why `currentScore` stays untouched.
 *
 * Every number below was explicitly confirmed as the authoritative business
 * rule (not invented, not reverse-engineered from the workbook) -- this is
 * the ONE place they are allowed to appear as numeric literals; every other
 * layer (read model, presentation, UI) must go through this module rather
 * than hold its own copy.
 *
 * Two genuinely different shapes of rule exist here:
 *
 * - DAY-BASED families (every family below except guard/reserve): each
 *   real, CONFIRMED, in-range duty Event independently contributes its
 *   family's flat weight -- a 3-day rasar stretch is 3 separate 0.2
 *   contributions, never one lump 0.2. `oxid`/`evacuation_on_call`/`callup`
 *   are real, confirmed duties too; they simply carry a weight of `0` --
 *   never omitted from the table, so their "worth nothing" status is an
 *   explicit, documented fact rather than an accidental gap.
 * - BLOCK-BASED (guard/reserve ONLY): a `numberOfDays × rate` calculation
 *   is explicitly WRONG for these two families -- they are discrete
 *   allocation types, not a per-day rate. `resolveGuardReserveBlockShape`
 *   below is the one place that decides which of the three known shapes
 *   (or "unsupported") a real consecutive-day block matches.
 */
export type DayBasedDutyFamily = Exclude<DutyFamily, "guard" | "reserve">;

/**
 * The canonical per-day weight for every duty family EXCEPT guard/reserve
 * (which are block-based -- see `GUARD_RESERVE_BLOCK_WEIGHT` below).
 * `oxid`/`evacuation_on_call`/`callup` are listed explicitly at `0` --
 * confirmed business rule, not an omission: "zero-value duties are still
 * real duties, but they contribute 0 to הקצאות שבוצעו."
 */
export const DUTY_ALLOCATION_WEIGHT_BY_FAMILY: Readonly<Record<DayBasedDutyFamily, number>> = {
  rasar: 0.2,
  daily_kitchen: 0.2,
  full_kitchen: 0.5,
  weekend_kitchen: 1,
  oxid: 0,
  evacuation_on_call: 0,
  callup: 0,
};

/**
 * The three, and ONLY three, guard/reserve allocation-block shapes this
 * domain can classify -- confirmed business rules, never inferred from
 * `numberOfDays × rate`:
 *
 * - `single_day`: exactly 1 day.
 * - `half_week`: exactly 3 consecutive days, starting Monday (Mon-Tue-Wed).
 * - `weekend`: exactly 4 consecutive days, starting Thursday
 *   (Thu-Fri-Sat-Sun) -- the same real weekend allocation pattern the
 *   comparison target's own "weekend" concept refers to elsewhere in
 *   Fairness, confirmed as Thursday-Sunday for guard/reserve specifically
 *   (NOT the same 3-day Thu-Fri-Sat span `dutyBlocks.ts`'s
 *   `computeWeekendCompleteness` uses for `weekend_kitchen` -- the two
 *   families have different confirmed weekend spans, deliberately kept as
 *   two separate constants rather than one shared "weekend" shape).
 *
 * A REAL block matching none of these three (e.g. 2 days, 5 days, or a
 * 4-day span not starting Thursday) is a genuine, currently-unsupported
 * shape -- `resolveGuardReserveBlockShape` returns `null` rather than
 * guessing, and callers must surface that as an unresolved/diagnostic
 * fact, never silently drop or default it to one of the three weights.
 */
export type GuardReserveBlockShape = "single_day" | "half_week" | "weekend";

const GUARD_RESERVE_BLOCK_WEIGHT: Readonly<Record<GuardReserveBlockShape, number>> = {
  single_day: 0.25,
  half_week: 0.5,
  weekend: 1,
};

/** 0=Sunday .. 6=Saturday (`dayOfWeek`'s own convention). */
const MONDAY = 1;
const THURSDAY = 4;

/**
 * Classifies a guard/reserve `DutyBlock`'s shape from its FULL real span
 * (`dayCount` + the weekday its `startDate` falls on) -- never from a
 * range-truncated partial view. This is why callers must build blocks from
 * a person's COMPLETE event history before ever intersecting with an
 * effective date range: a real Thursday-Sunday weekend block that is only
 * half over as of today must still be recognized AS a weekend block (and
 * therefore contribute nothing until the whole thing is done), never
 * misread as a 1- or 2-day allocation just because only part of it has
 * happened yet.
 *
 * Returns `null` for any real shape outside the three confirmed ones --
 * deliberately never a guessed/default weight.
 */
export function resolveGuardReserveBlockShape(dayCount: number, startDate: string): GuardReserveBlockShape | null {
  if (dayCount === 1) return "single_day";

  const start = parseCalendarDate(startDate);
  if (!start) return null;

  if (dayCount === 3 && dayOfWeek(start) === MONDAY) return "half_week";
  if (dayCount === 4 && dayOfWeek(start) === THURSDAY) return "weekend";
  return null;
}

/** Enough to identify exactly which real block couldn't be classified -- never the raw `Event[]` (see `DutyBlock`'s own privacy convention). */
export interface UnsupportedGuardReserveBlock {
  dutyFamily: "guard" | "reserve";
  slot: number | null;
  startDate: string;
  endDate: string;
  dayCount: number;
}

export interface CompletedDutyAllocationResult {
  /**
   * `null` ONLY when at least one real, CONFIRMED guard/reserve block
   * overlapping the effective range has a shape this domain cannot
   * classify (see `unsupportedBlocks`) -- in that case the true total is
   * genuinely unknown, so this is never a partial/best-effort sum that
   * silently drops the unclassifiable block's contribution. Otherwise a
   * real, non-negative number (possibly `0`).
   */
  total: number | null;
  /** Every real, confirmed guard/reserve block overlapping the effective range whose shape didn't match single-day/half-week/weekend -- empty whenever `total` is a real number. */
  unsupportedBlocks: readonly UnsupportedGuardReserveBlock[];
}

/**
 * A genuine, SETTLED duty occurrence -- `category === "duty"` (which, by
 * construction in `lib/parsers/event.ts`'s `parseEvent`, always carries a
 * non-null `dutyFamily`; checked explicitly anyway, the same genuine-duty
 * test `lib/domain/dutyBlocks.ts`'s `isBlockableDutyEvent` already
 * established) AND CONFIRMED only -- a tentative ("?"-suffixed) duty is
 * still a plan, not yet a completed fact, same convention
 * `fairnessShiftEngine.ts`'s `isConfirmedNonShadowRoleShift` already
 * established for shifts.
 */
function isSettledDutyEvent(event: Event): event is Event & { dutyFamily: DutyFamily } {
  return event.category === "duty" && event.dutyFamily !== null && event.certainty === "confirmed";
}

function isDayBasedFamily(dutyFamily: DutyFamily): dutyFamily is DayBasedDutyFamily {
  return dutyFamily !== "guard" && dutyFamily !== "reserve";
}

function isGuardOrReserve(dutyFamily: DutyFamily): dutyFamily is "guard" | "reserve" {
  return dutyFamily === "guard" || dutyFamily === "reserve";
}

function datesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA <= endB && endA >= startB;
}

/**
 * The person's real "הקצאות שבוצעו" total: the sum of every DAY-BASED
 * family's flat weight for each real, confirmed, in-range duty day, PLUS
 * each real, confirmed, FULLY-in-range guard/reserve block's fixed
 * allocation weight. `[periodStartDate, effectiveEndDate]` is the caller's
 * already-resolved effective range (period start through
 * `min(today, period end)` -- see `buildDutyFairnessReadModel.ts`); this
 * function never re-derives it and never looks at "now" itself.
 *
 * Day-based families: each event independently gated on
 * `periodStartDate <= event.date <= effectiveEndDate` -- a multi-day rasar
 * stretch that starts before the period or is still ongoing past the
 * cutoff still contributes for exactly the days genuinely inside the
 * range, never the whole stretch, never zero days just because part of it
 * falls outside.
 *
 * Guard/reserve: blocks are built from `personId`'s ENTIRE event history
 * (never date-filtered first -- see `resolveGuardReserveBlockShape`'s own
 * docs for why), then a block only contributes its shape's fixed weight
 * when it (a) overlaps the effective range at all, (b) is fully CONFIRMED
 * (`DutyBlock.certainty`; a tentative/mixed block is not yet a settled
 * fact and never taints the total either), (c) has a classifiable shape,
 * and (d) is COMPLETELY contained in `[periodStartDate, effectiveEndDate]`
 * -- a block still partially in the future (or straddling the period
 * boundary) contributes `0` for now, exactly like any other future/
 * incomplete duty, never a partial/prorated credit (block-based rules are
 * never `numberOfDays × rate`).
 */
export function computeCompletedDutyAllocation(
  events: readonly Event[],
  personId: string,
  periodStartDate: string,
  effectiveEndDate: string,
): CompletedDutyAllocationResult {
  const personEvents = events.filter((event) => event.personId === personId);

  let total = 0;

  for (const event of personEvents) {
    if (!isSettledDutyEvent(event)) continue;
    if (!isDayBasedFamily(event.dutyFamily)) continue;
    if (event.date < periodStartDate || event.date > effectiveEndDate) continue;
    total += DUTY_ALLOCATION_WEIGHT_BY_FAMILY[event.dutyFamily];
  }

  const guardReserveBlocks = buildDutyBlocks(personEvents).filter(
    (block): block is DutyBlock & { dutyFamily: "guard" | "reserve" } => isGuardOrReserve(block.dutyFamily),
  );

  const unsupportedBlocks: UnsupportedGuardReserveBlock[] = [];

  for (const block of guardReserveBlocks) {
    if (block.certainty !== "confirmed") continue;
    if (!datesOverlap(block.startDate, block.endDate, periodStartDate, effectiveEndDate)) continue;

    const shape = resolveGuardReserveBlockShape(block.dayCount, block.startDate);
    if (shape === null) {
      unsupportedBlocks.push({
        dutyFamily: block.dutyFamily,
        slot: block.slot,
        startDate: block.startDate,
        endDate: block.endDate,
        dayCount: block.dayCount,
      });
      continue;
    }

    const fullyWithinRange = block.startDate >= periodStartDate && block.endDate <= effectiveEndDate;
    if (!fullyWithinRange) continue;

    total += GUARD_RESERVE_BLOCK_WEIGHT[shape];
  }

  if (unsupportedBlocks.length > 0) return { total: null, unsupportedBlocks };
  return { total, unsupportedBlocks: [] };
}
