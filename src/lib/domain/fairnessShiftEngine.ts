import { calendarMonthOfLocalNow, daysInCalendarMonth, parseMonthParam, type CalendarMonthKey } from "./calendarMonth";
import { formatCalendarDate } from "./dateRange";
import type { Event } from "./event";
import {
  combineFairnessDataCompleteness,
  COMPLETE_FAIRNESS_DATA,
  fairnessDataCompleteness,
  isFairnessWeekendDate,
  resolveFairnessPeriodStatus,
  type FairnessDataCompleteness,
  type FairnessPeriodStatus,
} from "./fairnessFoundation";
import {
  buildFairnessPersonContext,
  resolveFairnessComparisonGroupKey,
  type FairnessComparisonGroupKey,
} from "./fairnessGroups";
import { resolveFairnessShiftOpportunity, type FairnessParticipationWindow } from "./fairnessParticipation";
import type { LocalNow } from "./localNow";
import { EMPTY_RESERVE_ROLE_PARTICIPATION, type ReserveRoleParticipation } from "./reserveParticipation";
import type { Person } from "./types";

/**
 * PR #2 -- the shift Fairness engine, built entirely on PR #48's foundation
 * (`fairnessFoundation.ts`/`fairnessParticipation.ts`/`fairnessGroups.ts`).
 * Answers, per person in one comparison group: how much did they actually
 * work compared with how much it was reasonable to expect from them, given
 * their participation, eligibility, and known availability?
 *
 * Deliberately NOT a team-average split. For every real (date, day/night,
 * role) shift slot in the period, this determines who was a genuine
 * candidate for it (eligible for the role this period, within their own
 * participation window, and not blocked by a known absence/constraint on
 * that exact slot) -- reusing `buildFairnessPersonContext` outright, never
 * re-deriving participation/eligibility a second time. A person's personal
 * target is their SHARE of the group's total genuine opportunities, applied
 * to the group's total actual shift count -- so someone with half as many
 * real opportunities (fewer eligible days, more constraints, a shorter
 * participation window) is expected to have done proportionally less, not
 * an equal split. Weekend shifts are tracked as a fully separate actual/
 * target pair from general shifts (no arbitrary weekend weighting), using
 * the exact same opportunity-share method restricted to weekend dates.
 *
 * Deliberately period-SHAPE-agnostic, like every PR #48 primitive: the core
 * `computeShiftFairnessForGroup` takes a plain `periodDates` array, so the
 * SAME function serves a calendar month or a single week without knowing
 * either shape -- a future weekly view needs no engine changes, only a
 * different `periodDates` array. No `Date`/UTC, no score, no snapshot.
 */

// ---------------------------------------------------------------------------
// Time behavior: current-month calculation stops at today, never projects
// into the future portion of the month. A closed historical month is
// calculated in full from whatever source data is available.
// ---------------------------------------------------------------------------

/** Resolves the raw `?month=` query param against `now` -- an invalid/missing value falls back to the month containing `now`, same convention as `lib/domain/dateRange.ts`'s `resolveManagerDateRange`. */
export function resolveShiftFairnessMonth(monthParam: string | null | undefined, now: LocalNow): CalendarMonthKey {
  return parseMonthParam(monthParam ?? undefined) ?? calendarMonthOfLocalNow(now);
}

/**
 * Every calendar date of `month` that has actually happened as of `now`:
 * the full month for a past month (every date is `<= now.date`), only
 * `1..now.date` for the month `now` itself falls in, and an EMPTY array for
 * a wholly future month -- Fairness must never be calculated from shifts
 * that haven't happened yet. `computeShiftFairnessForGroup` handles an
 * empty list safely (see its own docstring).
 */
export function resolveShiftFairnessPeriodDates(month: CalendarMonthKey, now: LocalNow): string[] {
  const totalDays = daysInCalendarMonth(month.year, month.month);
  const dates: string[] = [];
  for (let day = 1; day <= totalDays; day++) {
    const date = formatCalendarDate({ year: month.year, month: month.month, day });
    if (date <= now.date) dates.push(date);
  }
  return dates;
}

/**
 * `"current"` vs `"closed"` for the WHOLE month `month` represents --
 * deliberately computed from the month's own real end date, never from the
 * (possibly today-capped) `resolveShiftFairnessPeriodDates` result, so a
 * wholly future month still correctly reads `"current"` (not yet closed)
 * even though it has zero evaluable dates today.
 */
export function resolveShiftFairnessPeriodStatus(month: CalendarMonthKey, now: LocalNow): FairnessPeriodStatus {
  const totalDays = daysInCalendarMonth(month.year, month.month);
  const monthEndDate = formatCalendarDate({ year: month.year, month: month.month, day: totalDays });
  return resolveFairnessPeriodStatus(monthEndDate, now);
}

// ---------------------------------------------------------------------------
// Balanced tolerance
// ---------------------------------------------------------------------------

/**
 * Half of one shift. Shifts are discrete -- nobody can work a fractional
 * shift -- while a proportional-opportunity target is generally a
 * fractional real number (e.g. 3.2 shifts). A real distribution can never
 * land closer to that target than the nearest whole shift, so being off by
 * less than half a shift is not a meaningful deviation, it's simply the
 * unavoidable rounding gap between a fractional fair share and an integer
 * outcome. This is the smallest tolerance that can be justified from the
 * data itself -- not an arbitrary smoothing constant.
 */
export const SHIFT_FAIRNESS_BALANCED_TOLERANCE_SHIFTS = 0.5;

export type FairnessShiftStatus = "below" | "balanced" | "above";

/** `deviation = actual - target`. Within `±SHIFT_FAIRNESS_BALANCED_TOLERANCE_SHIFTS` (inclusive) is `"balanced"` -- see the tolerance's own docstring for why. */
export function resolveFairnessShiftStatus(deviation: number): FairnessShiftStatus {
  if (deviation > SHIFT_FAIRNESS_BALANCED_TOLERANCE_SHIFTS) return "above";
  if (deviation < -SHIFT_FAIRNESS_BALANCED_TOLERANCE_SHIFTS) return "below";
  return "balanced";
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

const SHIFT_PERIODS = ["day", "night"] as const;

export interface ShiftFairnessPersonResult {
  personId: string;
  actualShifts: number;
  target: number;
  deviation: number;
  status: FairnessShiftStatus;
  weekendActualShifts: number;
  weekendTarget: number;
  weekendDeviation: number;
  weekendStatus: FairnessShiftStatus;
  /** How many genuine (date, day/night) opportunities this person had this period -- context for the target, not a metric of its own. */
  opportunityCount: number;
  weekendOpportunityCount: number;
  dataCompleteness: FairnessDataCompleteness;
}

export interface ShiftFairnessGroupResult {
  role: FairnessComparisonGroupKey;
  /** Sorted ascending. Empty when the requested period has no evaluable dates yet (a wholly future month). */
  periodDates: readonly string[];
  people: readonly ShiftFairnessPersonResult[];
}

function withinParticipationWindow(date: string, window: FairnessParticipationWindow): boolean {
  if (window.activeStartDate === null || window.activeEndDate === null) return false;
  return date >= window.activeStartDate && date <= window.activeEndDate;
}

interface PersonShiftFacts {
  person: Person;
  actualShifts: number;
  weekendActualShifts: number;
  opportunityCount: number;
  weekendOpportunityCount: number;
  dataCompleteness: FairnessDataCompleteness;
}

/**
 * A real, settled shift Event for role `role` -- CONFIRMED only (a
 * tentative shift is not yet a settled fact) and never a shadow ("- צל")
 * assignment, the same convention `lib/domain/shiftCoverage.ts` already
 * established ("shadow shifts never count as primary coverage") -- a
 * shadow assignment means observing/learning, not independently carrying
 * the workload. Shared by the per-date actual count below AND by group
 * membership (see `isRoleComparisonMember`) so the two never define
 * "confirmed role evidence" differently.
 */
function isConfirmedNonShadowRoleShift(event: Event, role: FairnessComparisonGroupKey): boolean {
  return event.category === "shift" && event.certainty === "confirmed" && event.role === role && !event.shadow;
}

/** "Actual shifts performed" this date, role `role`, for `personEvents` (already filtered to one person). */
function countActualShiftsForDate(personEvents: readonly Event[], date: string, role: FairnessComparisonGroupKey): number {
  return personEvents.filter((event) => event.date === date && isConfirmedNonShadowRoleShift(event, role)).length;
}

/**
 * Whether `person` belongs to comparison group `role` for the PURPOSE OF
 * THIS ENGINE -- a strictly WIDER test than `resolveFairnessComparisonGroupKey`
 * alone (follow-up fix). A person's CURRENT `isSupervisor`/`isTechnician`
 * flags decide group membership everywhere else in the foundation, but
 * capability is undated (see `"eligibility_undated"`) -- if it changes
 * (someone stops being flagged a technician, is reclassified, etc.), a
 * REAL confirmed shift they actually worked as that role, this period,
 * must never simply disappear because the flag no longer matches. Without
 * this widening, `computeShiftFairnessForGroup`'s own `people.filter(...)`
 * would silently drop that person's row entirely -- their evidenced work
 * wouldn't just be excluded from opportunity accounting, it would never
 * be visible ANYWHERE in this role's results.
 *
 * A person included ONLY via this evidence path (current capability for
 * `role` is false) still goes through `resolveFairnessRoleEligibility`
 * normally in `computePersonShiftFacts` -- which requires the CURRENT
 * capability flag first -- so they correctly receive zero opportunities
 * (nothing here grants them a forward-looking share they're not currently
 * flagged capable of); only their real `actualShifts` count is preserved.
 * That is a deliberate, narrow fix for VISIBILITY of real evidence, not a
 * reopening of the eligibility rule itself.
 */
function isRoleComparisonMember(
  person: Person,
  role: FairnessComparisonGroupKey,
  events: readonly Event[],
  periodStartDate: string | null,
  periodEndDate: string | null,
): boolean {
  if (resolveFairnessComparisonGroupKey(person) === role) return true;
  if (periodStartDate === null || periodEndDate === null) return false;

  return events.some(
    (event) =>
      event.personId === person.id &&
      isConfirmedNonShadowRoleShift(event, role) &&
      event.date >= periodStartDate &&
      event.date <= periodEndDate,
  );
}

function computePersonShiftFacts(
  person: Person,
  role: FairnessComparisonGroupKey,
  events: readonly Event[],
  sortedDates: readonly string[],
  periodStartDate: string | null,
  periodEndDate: string | null,
  reserveParticipation: ReserveRoleParticipation,
): PersonShiftFacts {
  const personEvents = events.filter((event) => event.personId === person.id);

  let actualShifts = 0;
  let weekendActualShifts = 0;
  for (const date of sortedDates) {
    const countForDate = countActualShiftsForDate(personEvents, date, role);
    actualShifts += countForDate;
    if (isFairnessWeekendDate(date)) weekendActualShifts += countForDate;
  }

  // No evaluable period dates at all (a wholly future month) -- nothing to
  // resolve participation/eligibility against; actual stays whatever it is
  // (always 0 in practice, since there are no dates to have Events on).
  if (periodStartDate === null || periodEndDate === null) {
    return { person, actualShifts, weekendActualShifts, opportunityCount: 0, weekendOpportunityCount: 0, dataCompleteness: COMPLETE_FAIRNESS_DATA };
  }

  // Reused outright, never re-derived: the SAME participation window +
  // per-role eligibility PR #48 already established.
  const context = buildFairnessPersonContext(person, events, periodStartDate, periodEndDate, reserveParticipation);
  const eligibility = context.eligibility.find((entry) => entry.role === role);

  const completenessParts: FairnessDataCompleteness[] = [context.participation.dataCompleteness];
  if (eligibility) completenessParts.push(eligibility.dataCompleteness);

  let opportunityCount = 0;
  let weekendOpportunityCount = 0;

  // Not eligible for this role's rotation at all this period -> zero
  // opportunities, full stop -- a person who cannot perform this role must
  // never receive an opportunity share (this is intentionally checked BEFORE
  // the per-slot loop, not per-slot, since eligibility is a whole-period fact).
  if (eligibility?.eligible) {
    for (const date of sortedDates) {
      if (!withinParticipationWindow(date, context.participation)) continue;
      const eventsForDate = personEvents.filter((event) => event.date === date);

      for (const shiftPeriod of SHIFT_PERIODS) {
        const opportunity = resolveFairnessShiftOpportunity(eventsForDate, shiftPeriod);
        if (opportunity.dataCompleteness.status === "partial") completenessParts.push(opportunity.dataCompleteness);
        // "available" only -- a blocked slot is correctly zero opportunity,
        // and an "unmodeled_constraint" slot is NEVER silently counted as
        // available either (missing information is never treated as
        // verified availability -- it only shows up as a completeness gap).
        if (opportunity.status !== "available") continue;

        opportunityCount += 1;
        if (isFairnessWeekendDate(date)) weekendOpportunityCount += 1;
      }
    }
  }

  return {
    person,
    actualShifts,
    weekendActualShifts,
    opportunityCount,
    weekendOpportunityCount,
    dataCompleteness: combineFairnessDataCompleteness(completenessParts),
  };
}

/** `target = totalActual * (personOpportunities / totalOpportunities)` -- `0` (never a divide-by-zero) when the group has zero total opportunities. */
function computeShare(personOpportunities: number, totalOpportunities: number, totalActual: number): number {
  if (totalOpportunities <= 0) return 0;
  return totalActual * (personOpportunities / totalOpportunities);
}

/**
 * Computes shift Fairness for every member of comparison group `role` --
 * `resolveFairnessComparisonGroupKey(person) === role` (from
 * `fairnessGroups.ts`, never a separate/duplicated group definition;
 * called "MODELABLE" members below) OR, per an earlier follow-up fix, a
 * person whose CURRENT capability no longer includes `role` but who has
 * real confirmed evidence of having worked it this period
 * (`isRoleComparisonMember`; called "evidence-only" members below) --
 * their evidenced work stays visible even though it can no longer earn
 * them a forward opportunity share (capability isn't historically dated).
 *
 * SECOND follow-up fix: an evidence-only member's real `actualShifts` is
 * NEVER folded into the totals the opportunity-share formula redistributes
 * onto other people's targets. Not being able to model their historical
 * opportunities (their current capability flag says they shouldn't have
 * any) is not license to silently hand their real workload to whichever
 * modelable members currently hold opportunities -- that would manufacture
 * an inflated target for people whose own availability never changed.
 * `totalActual`/`totalOpportunity` (general and weekend) are therefore
 * summed over MODELABLE members ONLY; an evidence-only member's own
 * `target`/`weekendTarget` is fixed at `0` (never computed from the share
 * formula, never inventing a historical eligibility this codebase doesn't
 * have) and flagged with `"shift_target_unmodelable_evidence_only"` --
 * distinct from the group-level `"shift_target_no_group_opportunities"`,
 * which now only ever reflects an anomaly within the MODELABLE pool
 * itself.
 *
 * `people`/`events` may be the full roster/period Event set -- this filters
 * to the group and to each person's own Events itself. `periodDates` is
 * whatever the caller resolved (typically
 * `resolveShiftFairnessPeriodDates`'s today-capped current-month dates, or
 * a full historical month/week) -- an EMPTY array is handled safely: every
 * member gets `actualShifts: 0`, `target: 0`, `status: "balanced"`.
 *
 * `reserveParticipation` defaults to empty, the safe direction (see
 * `fairnessParticipation.ts`).
 */
export function computeShiftFairnessForGroup(
  role: FairnessComparisonGroupKey,
  people: readonly Person[],
  events: readonly Event[],
  periodDates: readonly string[],
  reserveParticipation: ReserveRoleParticipation = EMPTY_RESERVE_ROLE_PARTICIPATION,
): ShiftFairnessGroupResult {
  const sortedDates = [...periodDates].sort();
  const periodStartDate = sortedDates[0] ?? null;
  const periodEndDate = sortedDates[sortedDates.length - 1] ?? null;

  const groupMembers = people.filter((person) =>
    isRoleComparisonMember(person, role, events, periodStartDate, periodEndDate),
  );

  const facts = groupMembers.map((person) =>
    computePersonShiftFacts(person, role, events, sortedDates, periodStartDate, periodEndDate, reserveParticipation),
  );

  // Only members whose CURRENT capability actually matches `role` count
  // toward the totals the share formula redistributes -- see this
  // function's own docstring for why an evidence-only member's workload
  // must never inflate someone else's target.
  const modelableFacts = facts.filter((fact) => resolveFairnessComparisonGroupKey(fact.person) === role);

  const totalActual = modelableFacts.reduce((sum, fact) => sum + fact.actualShifts, 0);
  const totalOpportunity = modelableFacts.reduce((sum, fact) => sum + fact.opportunityCount, 0);
  const totalWeekendActual = modelableFacts.reduce((sum, fact) => sum + fact.weekendActualShifts, 0);
  const totalWeekendOpportunity = modelableFacts.reduce((sum, fact) => sum + fact.weekendOpportunityCount, 0);

  // Zero (modelable) opportunities is only a genuine data-incompleteness
  // signal when there was real (modelable) workload it failed to explain
  // (`totalActual > 0` -- "unallocatable workload"). Zero opportunities
  // WITH zero actual work is simply nothing to distribute -- a normal,
  // complete outcome (an idle group/subset, or an empty period), never
  // flagged as incomplete.
  const groupOpportunityGap =
    totalOpportunity === 0 && totalActual > 0
      ? fairnessDataCompleteness(["shift_target_no_group_opportunities"])
      : COMPLETE_FAIRNESS_DATA;
  const weekendGroupOpportunityGap =
    totalWeekendOpportunity === 0 && totalWeekendActual > 0
      ? fairnessDataCompleteness(["shift_target_no_group_opportunities"])
      : COMPLETE_FAIRNESS_DATA;

  const personResults: ShiftFairnessPersonResult[] = facts.map((fact) => {
    const isModelable = resolveFairnessComparisonGroupKey(fact.person) === role;

    // An evidence-only member's `opportunityCount` is always 0 (eligibility
    // still requires the current capability flag -- see
    // `computePersonShiftFacts`), so `computeShare` would already yield 0
    // for them either way; the explicit branch below exists to make that
    // "never modeled, never guessed" intent robust to change, not to rely
    // on that coincidence, and to attach the dedicated completeness reason.
    const target = isModelable ? computeShare(fact.opportunityCount, totalOpportunity, totalActual) : 0;
    const weekendTarget = isModelable
      ? computeShare(fact.weekendOpportunityCount, totalWeekendOpportunity, totalWeekendActual)
      : 0;
    const deviation = fact.actualShifts - target;
    const weekendDeviation = fact.weekendActualShifts - weekendTarget;

    const unmodelableReason = isModelable
      ? COMPLETE_FAIRNESS_DATA
      : fairnessDataCompleteness(["shift_target_unmodelable_evidence_only"]);

    return {
      personId: fact.person.id,
      actualShifts: fact.actualShifts,
      target,
      deviation,
      status: resolveFairnessShiftStatus(deviation),
      weekendActualShifts: fact.weekendActualShifts,
      weekendTarget,
      weekendDeviation,
      weekendStatus: resolveFairnessShiftStatus(weekendDeviation),
      opportunityCount: fact.opportunityCount,
      weekendOpportunityCount: fact.weekendOpportunityCount,
      dataCompleteness: combineFairnessDataCompleteness([
        fact.dataCompleteness,
        groupOpportunityGap,
        weekendGroupOpportunityGap,
        unmodelableReason,
      ]),
    };
  });

  return { role, periodDates: sortedDates, people: personResults };
}
