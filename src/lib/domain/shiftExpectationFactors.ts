import { BLOCKING_ABSENCE_KINDS } from "./operationalIssues";
import type { Event } from "./event";

/**
 * Justice Table redesign -- Shift Fairness's "why is my expected value
 * different" explanation. A person's personal shift target
 * (`fairnessShiftEngine.ts`) is already their SHARE of the group's genuine
 * opportunities, which is naturally reduced by real absences/constraints
 * this same period -- this module surfaces exactly THAT already-real cause
 * as a small set of honest, concrete counts, reusing nothing but already-
 * parsed `Event` fields (`category`/`absenceKind`) that exist today. It
 * never re-derives the target itself and never exposes the underlying
 * opportunity-share formula.
 *
 * Deliberately limited to what this codebase can reliably count: blocking
 * absences (leave/היעדרות), referrals (הפניה, its own distinct `AbsenceKind`),
 * and availability constraints (אילוצים). "Role availability" and
 * "exemptions" -- the spec's other example factors -- have NO reliable,
 * per-person data source for Shift Fairness specifically (exemptions are a
 * Duty-Fairness-table concept tied to the Potential sheet's own Fairness
 * table, not to a shift Event) -- never invented here; only what these
 * three real counts can honestly show is shown.
 */
export interface ShiftExpectationFactors {
  /** Distinct dates within the period with a blocking absence (vacation/abroad/medical/day_off -- `BLOCKING_ABSENCE_KINDS`, same convention as every other blocking-absence check in this codebase). */
  leaveDays: number;
  /** Distinct dates within the period with a `category === "constraint"` Event. */
  constraintDays: number;
  /** Distinct dates within the period with an `absenceKind === "referral"` Event. */
  referralDays: number;
}

const EMPTY_FACTORS: ShiftExpectationFactors = { leaveDays: 0, constraintDays: 0, referralDays: 0 };

function countDistinctDates(events: readonly Event[], predicate: (event: Event) => boolean): number {
  const dates = new Set<string>();
  for (const event of events) {
    if (predicate(event)) dates.add(event.date);
  }
  return dates.size;
}

const EMPTY_EXCLUDED_DATES: ReadonlySet<string> = new Set();

/**
 * `personEvents` may already be filtered to one person, or the full period
 * Event set -- this filters to `personId`'s own Events within
 * `[periodStartDate, periodEndDate]` itself, same convention as every other
 * Fairness primitive in this domain. Returns all-zero counts (never `null`)
 * when nothing is found -- an all-zero result simply means the caller
 * should render nothing (see `lib/presentation/fairnessCards.ts`), not that
 * the computation failed.
 *
 * `excludedDates` (Emergency Mode date exclusion, spec section 18) removes
 * individual dates from the MIDDLE of `[periodStartDate, periodEndDate]`,
 * not just its endpoints -- the caller's own `periodStartDate`/`periodEndDate`
 * are derived from an already-filtered `periodDates` array, so they
 * naturally shrink when an excluded date sits at either boundary, but a
 * date excluded from the middle of an otherwise-contiguous range would
 * still fall inside `[start, end]` without this. Passing the SAME excluded-
 * date set the headline fairness numbers were filtered against is what
 * keeps this tooltip from ever disagreeing with them.
 */
export function computeShiftExpectationFactors(
  events: readonly Event[],
  personId: string,
  periodStartDate: string,
  periodEndDate: string,
  excludedDates: ReadonlySet<string> = EMPTY_EXCLUDED_DATES,
): ShiftExpectationFactors {
  const relevantEvents = events.filter(
    (event) =>
      event.personId === personId &&
      event.date >= periodStartDate &&
      event.date <= periodEndDate &&
      !excludedDates.has(event.date),
  );
  if (relevantEvents.length === 0) return EMPTY_FACTORS;

  const leaveDays = countDistinctDates(
    relevantEvents,
    (event) => event.category === "absence" && event.absenceKind !== null && BLOCKING_ABSENCE_KINDS.has(event.absenceKind),
  );
  const constraintDays = countDistinctDates(relevantEvents, (event) => event.category === "constraint");
  const referralDays = countDistinctDates(
    relevantEvents,
    (event) => event.category === "absence" && event.absenceKind === "referral",
  );

  return { leaveDays, constraintDays, referralDays };
}
