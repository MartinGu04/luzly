import { calendarMonthOfLocalNow, daysInCalendarMonth, parseMonthParam, type CalendarMonthKey } from "./calendarMonth";
import { formatCalendarDate } from "./dateRange";
import type { Event, EventPeriod } from "./event";
import {
  combineFairnessDataCompleteness,
  COMPLETE_FAIRNESS_DATA,
  fairnessDataCompleteness,
  isFairnessWeekendDate,
  resolveFairnessPeriodStatus,
  type FairnessDataCompleteness,
  type FairnessPeriodStatus,
  type FairnessStatus,
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
 *
 * CLOSED historical periods (`periodStatus: "closed"`) are modeled more
 * conservatively than the current/open period: current capability
 * (`isTechnician`/`isSupervisor`) is undated, so it is NEVER treated as
 * proof of what a person's rotation actually was during a period that's
 * already over. A closed period's target/deviation/status are real numbers
 * only where genuinely period-dated evidence exists (the Fairness sheet's
 * own allocation for THAT period, via `reserveParticipation`); otherwise
 * they're `null` -- see `isRoleModelable`'s own docstring for the full
 * current-vs-closed rule. Actual, confirmed historical work stays visible
 * either way.
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

/**
 * Shares its three-word vocabulary with Duty Fairness's `DutyFairnessStatus`
 * (`fairnessAnalysis.ts`) via the common `FairnessStatus` alias
 * (`fairnessFoundation.ts`) -- kept as its own named type here because the
 * two modes compute it completely differently (this one has a ±0.5-shift
 * tolerance band; Duty Fairness has none). Re-exported under this name
 * unchanged so nothing importing `FairnessShiftStatus` from this module
 * needs to change (PR #3 is a pure type extraction here, not a behavior
 * change to Shift Fairness).
 */
export type FairnessShiftStatus = FairnessStatus;

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

/**
 * `target`/`deviation`/`status` (and their weekend counterparts) are `null`
 * whenever `role` is not MODELABLE for this person this period (see
 * `isRoleModelable`) -- their target genuinely cannot be modeled from
 * today's data, which is a DIFFERENT fact from a real, computed target of
 * `0` (a modelable member who simply had no genuine opportunity). Never
 * guess a `0` in place of `null` here -- same convention
 * `lib/domain/fairnessAnalysis.ts`'s `computeScoreDelta`/`computeGapToTarget`
 * already established for the duty Fairness table ("a missing previous
 * score is NEVER treated as zero"). `null` here always pairs with ONE of
 * two `dataCompleteness` reasons, distinguishing WHY: `"shift_target_unmodelable_evidence_only"`
 * for a current period (capability-based -- not their primary rotation, or
 * no current capability for `role` at all) or `"shift_target_unmodelable_historical"`
 * for a closed period (current capability is never proof of historical
 * qualification timing, regardless of primary-rotation status -- see
 * `isRoleModelable`'s own docstring).
 */
export interface ShiftFairnessPersonResult {
  personId: string;
  actualShifts: number;
  target: number | null;
  deviation: number | null;
  status: FairnessShiftStatus | null;
  weekendActualShifts: number;
  weekendTarget: number | null;
  weekendDeviation: number | null;
  weekendStatus: FairnessShiftStatus | null;
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
 * alone (follow-up fix). `role` being this person's PRIMARY comparison
 * group (supervisor-over-technician precedence, same as everywhere else in
 * the foundation) always qualifies. Two DIFFERENT situations both fall
 * through to the evidence check below instead:
 *
 * - Capability for `role` is undated (see `"eligibility_undated"`) -- if it
 *   changes (someone stops being flagged a technician, is reclassified,
 *   etc.), a REAL confirmed shift they actually worked as that role, this
 *   period, must never simply disappear because the flag no longer
 *   matches.
 * - A dual-capable person (`isSupervisor && isTechnician`) whose PRIMARY
 *   rotation is the OTHER role (clarified business rule: supervisor is the
 *   normal rotation for a dual-capable person; a supervisor working an
 *   occasional technician shift is exceptional/emergency, not proof they
 *   belong to the normal technician rotation) -- their real technician
 *   shift must still be visible in the technician group's own results,
 *   even though it's not evidence of normal technician-rotation
 *   membership.
 *
 * Without this widening, `computeShiftFairnessForGroup`'s own
 * `people.filter(...)` would silently drop that person's row entirely in
 * either case -- their evidenced work wouldn't just be excluded from
 * opportunity accounting, it would never be visible ANYWHERE in this
 * role's results.
 *
 * A person included ONLY via this evidence path -- whether because their
 * CURRENT capability for `role` is false, or because `role` is merely
 * their non-primary (secondary) capability -- correctly receives ZERO
 * opportunities in `computePersonShiftFacts` (which gates the opportunity
 * loop on "`role` IS this person's primary group", not merely
 * `resolveFairnessRoleEligibility`'s own capability check -- eligibility
 * alone is deliberately role-symmetric, true for both of a dual-capable
 * person's roles, so it cannot be the gate here); only their real
 * `actualShifts` count is preserved. That is a deliberate, narrow fix for
 * VISIBILITY of real evidence, not a reopening of the eligibility rule
 * itself, and not a promotion of exceptional cross-role work into a normal
 * rotation.
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

/**
 * Whether `role` can be MODELED (a real target computed) for `person` --
 * final PR #2 audit: THIS is the one place "current" and "closed" periods
 * genuinely diverge, and it's the only correctness-driven exception to
 * "current-period behavior is unchanged".
 *
 * - `"current"` (the open, still-in-progress period): unchanged from the
 *   already-approved rule -- `role` must be this person's PRIMARY
 *   comparison group (`resolveFairnessComparisonGroupKey`,
 *   supervisor-over-technician precedence). Today's capability flag is a
 *   reasonable basis for an ONGOING period precisely because it's still
 *   ongoing -- there's no "was it true back then" question for a period
 *   that hasn't finished yet.
 * - `"closed"` (a finished historical period): current capability is NOT
 *   proof of historical qualification timing -- `isTechnician`/
 *   `isSupervisor` carry no effective-from date (`"eligibility_undated"`),
 *   so treating "this is their rotation TODAY" as "this WAS their rotation
 *   throughout that PAST period" would manufacture a possibly-misleading
 *   verdict. Modelability instead requires genuinely period-DATED evidence
 *   -- the Fairness sheet's own allocation for THAT specific historical
 *   period (`reserveParticipation`, reused exactly as PR #48 already
 *   established it, never a new inference rule) -- independent of primary-
 *   group precedence entirely (a technically-secondary role with real
 *   period-dated evidence is just as modelable as a primary one; a
 *   technically-primary role with NO period-dated evidence is not
 *   modelable at all). One confirmed historical shift on its own is real
 *   evidence of THAT shift (see `isRoleComparisonMember` -- it still keeps
 *   the person's row visible), never proof of a whole period's worth of
 *   opportunities, so a lone Event is deliberately NOT treated as
 *   sufficient here.
 */
function isRoleModelable(
  person: Person,
  role: FairnessComparisonGroupKey,
  periodStatus: FairnessPeriodStatus,
  reserveParticipation: ReserveRoleParticipation,
): boolean {
  if (periodStatus === "closed") {
    const fairnessEvidence =
      role === "technician" ? reserveParticipation.technicianPersonIds : reserveParticipation.supervisorPersonIds;
    return fairnessEvidence.has(person.id);
  }
  return resolveFairnessComparisonGroupKey(person) === role;
}

function computePersonShiftFacts(
  person: Person,
  role: FairnessComparisonGroupKey,
  events: readonly Event[],
  sortedDates: readonly string[],
  periodStartDate: string | null,
  periodEndDate: string | null,
  periodStatus: FairnessPeriodStatus,
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

  // `isRoleModelable` decides whether `role` can be modeled for `person` at
  // all THIS period -- see its own docstring for the current/closed
  // divergence. For a CURRENT period this is "role is their primary
  // rotation" (unaffected by this audit); a modelable current-period
  // person must ALSO still be eligible per `resolveFairnessRoleEligibility`
  // (unchanged existing gate). For a CLOSED period, `isRoleModelable`
  // itself IS the complete gate -- it's built entirely from period-DATED
  // evidence, independent of (and not additionally gated by) the CURRENT
  // capability check `resolveFairnessRoleEligibility` performs first,
  // since requiring that too would wrongly re-introduce "current capability
  // as historical proof" through the back door (e.g. someone whose
  // capability flag no longer matches today, but whom the period's OWN
  // Fairness sheet genuinely proves was doing this role at the time).
  //
  // This gate is intentionally checked BEFORE the per-slot loop, not
  // per-slot, since modelability is a whole-period fact.
  const modelable = isRoleModelable(person, role, periodStatus, reserveParticipation);
  const shouldAccrueOpportunities = periodStatus === "closed" ? modelable : modelable && (eligibility?.eligible ?? false);

  if (shouldAccrueOpportunities) {
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
 * Computes shift Fairness for every member of comparison group `role`.
 * Group MEMBERSHIP (whose row appears at all) is always
 * `resolveFairnessComparisonGroupKey(person) === role` (primary rotation)
 * OR real confirmed evidence of having worked `role` this period
 * (`isRoleComparisonMember`) -- unaffected by `periodStatus`, since real
 * evidenced work must stay visible regardless of whether the period is
 * still open or already closed.
 *
 * Whether a member's target can actually be MODELED (a real number, versus
 * `null`) is decided by `isRoleModelable`, and is the ONE place
 * `periodStatus` changes this engine's behavior (final PR #2 audit):
 *
 * - `"current"`: unchanged from the already-approved rule -- modelable
 *   only when `role` is the person's PRIMARY rotation AND they're eligible
 *   per `resolveFairnessRoleEligibility`. A dual-capable person's
 *   SECONDARY role, or anyone whose current capability doesn't include
 *   `role` at all, is "evidence-only": real `actualShifts` stays visible,
 *   but `target`/`deviation`/`status` (and weekend equivalents) are
 *   `null`, flagged `"shift_target_unmodelable_evidence_only"`, and never
 *   folded into the totals redistributed onto modelable members.
 * - `"closed"`: current capability/primary-rotation status is NOT treated
 *   as proof of historical qualification timing -- modelable ONLY when
 *   genuinely period-dated evidence exists (`reserveParticipation`, the
 *   Fairness sheet's own allocation for THAT historical period). Everyone
 *   else -- including a person whose CURRENT capability matches `role`, or
 *   who has a real confirmed historical shift or two -- keeps their
 *   `actualShifts` visible but gets `null` target/deviation/status,
 *   flagged `"shift_target_unmodelable_historical"`. One confirmed
 *   historical shift is never treated as proof of a whole period's worth
 *   of opportunities.
 *
 * Either way, `totalActual`/`totalOpportunity` (general and weekend) are
 * summed over MODELABLE members ONLY -- an unmodelable member's real
 * workload is NEVER folded into the totals the opportunity-share formula
 * redistributes onto other people's targets. Not being able to model
 * someone's own opportunities is not license to silently hand their real
 * workload to whichever modelable members currently hold opportunities --
 * that would manufacture an inflated target for people whose own
 * availability never changed.
 *
 * `people`/`events` may be the full roster/period Event set -- this filters
 * to the group and to each person's own Events itself. `periodDates` is
 * whatever the caller resolved (typically
 * `resolveShiftFairnessPeriodDates`'s today-capped current-month dates, or
 * a full historical month/week) -- an EMPTY array is handled safely: every
 * member gets `actualShifts: 0`, `target: 0`, `status: "balanced"`.
 * `periodStatus` (typically `resolveShiftFairnessPeriodStatus`'s result)
 * defaults to `"current"`, the pre-audit behavior, so an existing caller
 * that hasn't been updated to pass it explicitly keeps its current
 * behavior unchanged. `reserveParticipation` defaults to empty, the safe
 * direction (see `fairnessParticipation.ts`) -- for a closed period this
 * also means "no dated evidence supplied", the safe/conservative default
 * that can only ever make MORE people unmodelable, never fewer.
 */
export function computeShiftFairnessForGroup(
  role: FairnessComparisonGroupKey,
  people: readonly Person[],
  events: readonly Event[],
  periodDates: readonly string[],
  reserveParticipation: ReserveRoleParticipation = EMPTY_RESERVE_ROLE_PARTICIPATION,
  periodStatus: FairnessPeriodStatus = "current",
): ShiftFairnessGroupResult {
  const sortedDates = [...periodDates].sort();
  const periodStartDate = sortedDates[0] ?? null;
  const periodEndDate = sortedDates[sortedDates.length - 1] ?? null;

  const groupMembers = people.filter((person) =>
    isRoleComparisonMember(person, role, events, periodStartDate, periodEndDate),
  );

  const facts = groupMembers.map((person) =>
    computePersonShiftFacts(
      person,
      role,
      events,
      sortedDates,
      periodStartDate,
      periodEndDate,
      periodStatus,
      reserveParticipation,
    ),
  );

  // Only members for whom `role` is actually MODELABLE this period (see
  // `isRoleModelable` -- primary rotation for a current period, genuinely
  // period-dated evidence for a closed one) count toward the totals the
  // share formula redistributes -- see this function's own docstring for
  // why an unmodelable member's workload must never inflate someone else's
  // target.
  const modelableFacts = facts.filter((fact) => isRoleModelable(fact.person, role, periodStatus, reserveParticipation));

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
    const isModelable = isRoleModelable(fact.person, role, periodStatus, reserveParticipation);

    // An unmodelable member's target is NOT modelable -- never a guessed
    // `0` standing in for "no meaningful target exists" (that would produce
    // a misleading "above" status from `actualShifts - 0`). `null`
    // propagates through deviation/status too, so a per-person view can
    // never show a normal below/balanced/above verdict for workload this
    // engine genuinely cannot attribute an opportunity to.
    const target = isModelable ? computeShare(fact.opportunityCount, totalOpportunity, totalActual) : null;
    const weekendTarget = isModelable
      ? computeShare(fact.weekendOpportunityCount, totalWeekendOpportunity, totalWeekendActual)
      : null;
    const deviation = target === null ? null : fact.actualShifts - target;
    const weekendDeviation = weekendTarget === null ? null : fact.weekendActualShifts - weekendTarget;

    // Two DIFFERENT reasons for the SAME null-target shape, distinguished
    // so a future UI can explain WHY: `"...evidence_only"` for a current
    // period (capability-based: not their primary rotation, or capability
    // doesn't match at all); `"...historical"` for a closed period
    // (current capability is never proof of historical qualification
    // timing, regardless of primary-rotation status).
    const unmodelableReason = isModelable
      ? COMPLETE_FAIRNESS_DATA
      : periodStatus === "closed"
        ? fairnessDataCompleteness(["shift_target_unmodelable_historical"])
        : fairnessDataCompleteness(["shift_target_unmodelable_evidence_only"]);

    return {
      personId: fact.person.id,
      actualShifts: fact.actualShifts,
      target,
      deviation,
      status: deviation === null ? null : resolveFairnessShiftStatus(deviation),
      weekendActualShifts: fact.weekendActualShifts,
      weekendTarget,
      weekendDeviation,
      weekendStatus: weekendDeviation === null ? null : resolveFairnessShiftStatus(weekendDeviation),
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

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** One real, settled shift Event counted toward a person's `actualShifts` -- carries the exact fields needed to find the literal source row in the real spreadsheet. */
export interface ContributingShiftEvent {
  date: string;
  period: EventPeriod;
  /** The workbook tab this Event was parsed from (e.g. "משמרות + תורנויות"). */
  sourceSheet: string;
  /** A1 notation of the exact cell this Event came from -- open this cell directly to verify/dispute what the engine believes it means. */
  sourceCell: string;
  /** The untouched raw cell text, exactly as typed into the sheet. */
  rawValue: string;
}

/**
 * Diagnostic-only, never called by the app itself -- the literal list of
 * real, settled shift Events that make up ONE person's `actualShifts` count
 * for `role` over `periodDates`, for auditing a specific displayed number
 * back to its exact source cells. Deliberately reuses the EXACT SAME two
 * filters `computeShiftFairnessForGroup` itself applies to compute
 * `actualShifts` -- `isConfirmedNonShadowRoleShift` or the date being
 * present in `periodDates` -- so this list's length is ALWAYS identical to
 * that function's own `actualShifts` for the same `events`/`personId`/
 * `role`/`periodDates` (proven by
 * "listContributingShiftEvents matches computeShiftFairnessForGroup's
 * actualShifts exactly" in `fairnessShiftEngine.test.ts`). There is
 * deliberately no second, hand-rolled filtering rule here that could ever
 * drift from the real one.
 *
 * `periodDates` is looked up via a `Set` rather than string comparison --
 * unlike `computeShiftFairnessForGroup`'s own date range check, this never
 * assumes `periodDates` is contiguous, since a caller auditing a specific
 * report might reasonably pass an arbitrary subset.
 */
export function listContributingShiftEvents(
  events: readonly Event[],
  personId: string,
  role: FairnessComparisonGroupKey,
  periodDates: readonly string[],
): ContributingShiftEvent[] {
  const periodDateSet = new Set(periodDates);

  return events
    .filter((event) => event.personId === personId && periodDateSet.has(event.date) && isConfirmedNonShadowRoleShift(event, role))
    .map((event) => ({
      date: event.date,
      period: event.period,
      sourceSheet: event.sourceSheet,
      sourceCell: event.sourceCell,
      rawValue: event.rawValue,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period));
}
