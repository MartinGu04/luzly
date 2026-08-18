import { BLOCKING_ABSENCE_KINDS } from "./operationalIssues";
import type { Event, EventPeriod } from "./event";
import {
  COMPLETE_FAIRNESS_DATA,
  fairnessDataCompleteness,
  type FairnessDataCompleteness,
} from "./fairnessFoundation";
import { classifyPersonnelType, hasShiftRoleCapability } from "./personnelType";
import { EMPTY_RESERVE_ROLE_PARTICIPATION, type ReserveRoleParticipation } from "./reserveParticipation";
import type { Person } from "./types";

/**
 * PR #48 -- the Fairness foundation's participation/eligibility/availability
 * primitives (see this PR's own README entry for the full investigation).
 * Deliberately period-SHAPE-agnostic: every function here takes plain
 * `periodStartDate`/`periodEndDate` ("YYYY-MM-DD") strings rather than a
 * `FairnessPeriodKey` or a month, so the SAME primitives serve the existing
 * h1/h2 duty period and a future shift-fairness period (e.g. a calendar
 * month) without this module needing to know either shape. Every date
 * comparison is plain string comparison (valid "YYYY-MM-DD" sorts
 * chronologically) -- no `Date`/UTC, matching every other file in this
 * directory.
 *
 * Reuses -- never re-derives -- the closest existing prior art
 * (`shiftCoverageRecommendation.ts`'s PR #37/#39 "participates in role R's
 * rotation" check) for its genuinely shared building blocks:
 * `classifyPersonnelType`'s permanent/regular/reserve/unclassified
 * categories, and `ReserveRoleParticipation`'s Fairness-table evidence.
 * This is intentionally a SEPARATE primitive, not a call into
 * `shiftCoverageRecommendation.ts` itself -- that module's rules are scoped
 * to one operational issue's date+missing-interval, evaluating shift/
 * absence/constraint OVERLAP against a specific gap; Fairness reasons over
 * a whole PERIOD instead, evaluating overall participation and per-day
 * shift-slot opportunity independently of any specific coverage problem.
 * `resolveFairnessRoleEligibility`'s permanent-service handling
 * deliberately DIVERGES from `participatesInRoleRotation` (see its own
 * docstring below) -- that source's "permanent is never eligible" turned
 * out to be a policy specific to that OTHER feature's candidate pool, not
 * a domain-wide fact, so it is not reused here.
 */

// ---------------------------------------------------------------------------
// 1. Participation -- when was this person actually part of the rotation?
// ---------------------------------------------------------------------------

export type FairnessParticipationBasis = "full_period" | "inferred_from_events" | "unknown";

/**
 * A person's participation window within one period. `activeStartDate`/
 * `activeEndDate` are `null` only for `basis === "unknown"`.
 *
 * IMPORTANT LIMITATION (verified by investigation, not a placeholder): כ"א
 * carries no stored join/leave/service-window date for ANY person, of any
 * personnelType -- not a missing feature of this function, a genuine gap
 * in the current source data. `"full_period"` is therefore an ASSUMPTION
 * for permanent/regular personnel (consistent with how the rest of this
 * app already treats them -- e.g. `lib/presentation/roster.ts`'s roster
 * listing never questions whether a קבע/חובה person is "still active"),
 * not a verified fact -- a permanent/regular person who joined or left
 * mid-period is NOT distinguishable from one present the whole period with
 * today's data. Because it's an assumption, NOT a verified fact,
 * `dataCompleteness` is `"partial"` for `"full_period"` too (see
 * `"participation_assumed_full_period"`) -- assumed participation must
 * never be presented with the same confidence as a verified one.
 * `"inferred_from_events"` (reserve/unclassified personnel) is a heuristic
 * lower bound/upper bound from actual Event evidence in the period, not an
 * authoritative window either -- a reservist can easily have gaps in their
 * own recorded Events within their real service window (no shift that
 * particular day is normal, not evidence of having left) -- so this window
 * is always a CONSERVATIVE evidence range, never asserted as the person's
 * literal first/last day of service. Every limitation here is reflected
 * honestly via `dataCompleteness`, never hidden -- `"complete"` is reserved
 * for facts this function can actually verify, which today is none of them.
 */
export interface FairnessParticipationWindow {
  personId: string;
  periodStartDate: string;
  periodEndDate: string;
  activeStartDate: string | null;
  activeEndDate: string | null;
  basis: FairnessParticipationBasis;
  dataCompleteness: FairnessDataCompleteness;
}

/**
 * Resolves `person`'s participation window for one period. `events` may be
 * the full period's Event set for many people -- this filters to `person`'s
 * own Events within `[periodStartDate, periodEndDate]` itself, so callers
 * never have to pre-filter (same convention as
 * `shiftCoverageRecommendation.ts`'s own internal `candidateEvents` filter).
 *
 * - permanent/regular (`classifyPersonnelType`) -> `"full_period"`, the
 *   whole period -- this app's existing default ASSUMPTION for these two
 *   categories (not new to this function), so `dataCompleteness` is
 *   `"partial"` (`"participation_assumed_full_period"`), never `"complete"`.
 * - reserve/unclassified -> bounded ONLY by actual Event evidence
 *   (any category -- a shift, duty, absence, or constraint Event all
 *   equally prove "this person was in the system that day") within the
 *   period; zero evidence -> `"unknown"`, never a guessed window.
 */
export function resolveFairnessParticipationWindow(
  person: Person,
  events: readonly Event[],
  periodStartDate: string,
  periodEndDate: string,
): FairnessParticipationWindow {
  const category = classifyPersonnelType(person.personnelType);

  if (category === "permanent" || category === "regular") {
    return {
      personId: person.id,
      periodStartDate,
      periodEndDate,
      activeStartDate: periodStartDate,
      activeEndDate: periodEndDate,
      basis: "full_period",
      dataCompleteness: fairnessDataCompleteness(["participation_assumed_full_period"]),
    };
  }

  const datesInPeriod = events
    .filter(
      (event) =>
        event.personId === person.id && event.date >= periodStartDate && event.date <= periodEndDate,
    )
    .map((event) => event.date)
    .sort();

  if (datesInPeriod.length === 0) {
    return {
      personId: person.id,
      periodStartDate,
      periodEndDate,
      activeStartDate: null,
      activeEndDate: null,
      basis: "unknown",
      dataCompleteness: fairnessDataCompleteness(["participation_unknown"]),
    };
  }

  return {
    personId: person.id,
    periodStartDate,
    periodEndDate,
    activeStartDate: datesInPeriod[0],
    activeEndDate: datesInPeriod[datesInPeriod.length - 1],
    basis: "inferred_from_events",
    dataCompleteness: fairnessDataCompleteness(["participation_inferred"]),
  };
}

// ---------------------------------------------------------------------------
// 2. Eligibility -- can this person actually perform this kind of shift?
// ---------------------------------------------------------------------------

export type FairnessEligibilityRole = "supervisor" | "technician";

export type FairnessRoleEligibilityBasis =
  | "not_capable"
  | "regular_included"
  | "evidence_confirmed"
  | "evidence_not_found";

/**
 * `dataCompleteness` always carries `"eligibility_undated"` -- see this
 * PR's README entry: `Person.isTechnician`/`isSupervisor` are a CURRENT
 * snapshot only, כ"א carries no effective-from date, so a qualification
 * that became valid partway through the period (verified: not historically
 * tracked) is applied identically to the whole period. This is not
 * conditional on the result -- it's true of every eligibility result this
 * function can ever produce today.
 */
export interface FairnessRoleEligibility {
  personId: string;
  role: FairnessEligibilityRole;
  eligible: boolean;
  basis: FairnessRoleEligibilityBasis;
  dataCompleteness: FairnessDataCompleteness;
}

/**
 * Whether `person` is eligible for role R's rotation this period.
 *
 * RECONSIDERED (follow-up to this PR): the initial version of this function
 * mirrored `shiftCoverageRecommendation.ts`'s PR #39
 * `participatesInRoleRotation` rule verbatim, including "permanent-service
 * (קבע) is never eligible, regardless of capability or evidence". Re-checking
 * that rule against the actual domain data found NO evidence it is a
 * domain-wide fact -- nothing in `lib/parsers/event.ts`/
 * `lib/domain/operationalIssues.ts` prevents a קבע person from holding a
 * real, confirmed shift Event, and `detectCapabilityMismatchIssues` checks
 * capability against the Event's role for EVERY person, permanent included.
 * The exclusion is scoped to that OTHER feature's own candidate pool (who
 * should be proactively paged to fill a last-minute gap) -- a prospective,
 * feature-specific policy choice, not proof that permanent personnel never
 * actually work shifts. Fairness asks a different, retrospective question
 * ("did this person actually do this work"), so encoding that unrelated
 * policy here would be wrong: a permanent person who genuinely appears in
 * the period's own evidence is a real participant and must be counted.
 *
 * FURTHER RECONSIDERED (second follow-up): the eligibility rule initially
 * still special-cased "unclassified" personnelType (missing/unrecognized
 * `personnelType`) as automatically excluded, with no evidence check at
 * all. That repeated the exact same mistake the permanent-service
 * reconsideration above just fixed for a different category: a person's
 * personnelType classification is orthogonal to whether they actually,
 * verifiably performed this role's work -- a CONFIRMED same-role shift
 * Event or the period's own Fairness-table evidence is proof of real
 * participation regardless of whether their personnelType happens to be
 * recognized. Discarding that proof because of an unrelated classification
 * gap would violate the same Fairness invariant. Unclassified personnel are
 * therefore evidence-gated exactly like permanent/reserve now -- never
 * automatically excluded, but also never assumed eligible without evidence
 * (no guessing either direction).
 *
 * The rule actually applied: no capability flag -> never (`"not_capable"`).
 * regular-service -> always, once capable (`"regular_included"`) -- the
 * only category still granted eligibility without evidence, since it's the
 * default shift pool. Every other category (permanent, reserve,
 * unclassified) -> capability alone is NOT enough; each needs the period's
 * own Fairness-table evidence (`reserveParticipation`, from
 * `deriveReserveRoleParticipation`/`resolveReserveRoleParticipation` --
 * despite its `Reserve*` naming, the SET itself is derived from the
 * Fairness sheet's allocation rows with no personnelType filtering, so
 * reusing it beyond reservists is a correct, not incidental, reuse) OR at
 * least one CONFIRMED same-role shift Event within the period
 * (`"evidence_confirmed"` either way, `"evidence_not_found"` when neither
 * exists -- never a guess when there is truly no evidence).
 * `reserveParticipation` defaults to empty -- the safe direction, only ever
 * making a non-regular person LESS likely to qualify, never more.
 */
export function resolveFairnessRoleEligibility(
  person: Person,
  role: FairnessEligibilityRole,
  events: readonly Event[],
  periodStartDate: string,
  periodEndDate: string,
  reserveParticipation: ReserveRoleParticipation = EMPTY_RESERVE_ROLE_PARTICIPATION,
): FairnessRoleEligibility {
  const dataCompleteness = fairnessDataCompleteness(["eligibility_undated"]);

  if (!hasShiftRoleCapability(person, role)) {
    return { personId: person.id, role, eligible: false, basis: "not_capable", dataCompleteness };
  }

  const category = classifyPersonnelType(person.personnelType);

  if (category === "regular") {
    return { personId: person.id, role, eligible: true, basis: "regular_included", dataCompleteness };
  }

  // permanent, reserve, AND unclassified are all evidence-gated identically
  // from here -- confirmed participation evidence must never be discarded
  // merely because personnelType is unrecognized/missing (see this
  // function's own docstring for why "unclassified -> automatically
  // excluded" was reconsidered and rejected).
  const fairnessEvidence =
    role === "technician" ? reserveParticipation.technicianPersonIds : reserveParticipation.supervisorPersonIds;
  if (fairnessEvidence.has(person.id)) {
    return { personId: person.id, role, eligible: true, basis: "evidence_confirmed", dataCompleteness };
  }

  const hasConfirmedSameRoleShiftInPeriod = events.some(
    (event) =>
      event.personId === person.id &&
      event.category === "shift" &&
      event.certainty === "confirmed" &&
      event.role === role &&
      event.date >= periodStartDate &&
      event.date <= periodEndDate,
  );

  return {
    personId: person.id,
    role,
    eligible: hasConfirmedSameRoleShiftInPeriod,
    basis: hasConfirmedSameRoleShiftInPeriod ? "evidence_confirmed" : "evidence_not_found",
    dataCompleteness,
  };
}

// ---------------------------------------------------------------------------
// 3. Availability -- shift-SLOT-level opportunity, not merely "available days".
// ---------------------------------------------------------------------------

export type FairnessShiftOpportunityStatus =
  | "available"
  | "blocked_absence"
  | "blocked_constraint"
  | "unmodeled_constraint";

export interface FairnessShiftOpportunity {
  status: FairnessShiftOpportunityStatus;
  dataCompleteness: FairnessDataCompleteness;
}

/**
 * Whether `person` had a shift-slot opportunity for one (date, period) --
 * `personEventsForDate` must already be filtered to that one person+date
 * (the caller's concern, like `dutyBlocks.ts`/`shiftCoverage.ts` elsewhere
 * in this domain). Current constraint/absence semantics (verified in
 * `lib/parsers/event.ts`):
 *
 * - a blocking absence (`BLOCKING_ABSENCE_KINDS` -- vacation/abroad/
 *   medical/day_off; "after"/"referral" are deliberately excluded, same
 *   convention as every other blocking-absence check in this codebase) ->
 *   `"blocked_absence"`.
 * - a full-day constraint (bare "אילוץ", parsed as `period: "unspecified"`)
 *   OR a constraint whose `period` exactly matches the requested shift
 *   period (day blocks day, night blocks night) -> `"blocked_constraint"`.
 * - a `"morning"` constraint has NO canonical day/night shift-slot mapping
 *   in this codebase today (`resolveEventShiftInterval` only resolves day/
 *   night) -- its real effect on this shift-slot is genuinely unknown, so
 *   this NEVER asserts blocked OR available on its account; it returns
 *   `"unmodeled_constraint"` with `dataCompleteness` marked partial, so a
 *   future UI can honestly show "נתונים חלקיים" instead of a wrong verdict.
 * - otherwise -> `"available"` -- no known absence/constraint blocks it,
 *   the same "absence of evidence of a block" reasoning
 *   `shiftCoverageRecommendation.ts`'s `isEligibleCandidate` already uses.
 */
export function resolveFairnessShiftOpportunity(
  personEventsForDate: readonly Event[],
  period: Extract<EventPeriod, "day" | "night">,
): FairnessShiftOpportunity {
  const hasBlockingAbsence = personEventsForDate.some(
    (event) =>
      event.category === "absence" && event.absenceKind !== null && BLOCKING_ABSENCE_KINDS.has(event.absenceKind),
  );
  if (hasBlockingAbsence) {
    return { status: "blocked_absence", dataCompleteness: COMPLETE_FAIRNESS_DATA };
  }

  const constraintEvents = personEventsForDate.filter((event) => event.category === "constraint");

  const hasBlockingConstraint = constraintEvents.some(
    (event) => event.period === "unspecified" || event.period === period,
  );
  if (hasBlockingConstraint) {
    return { status: "blocked_constraint", dataCompleteness: COMPLETE_FAIRNESS_DATA };
  }

  const hasUnmodeledConstraint = constraintEvents.some((event) => event.period === "morning");
  if (hasUnmodeledConstraint) {
    return {
      status: "unmodeled_constraint",
      dataCompleteness: fairnessDataCompleteness(["constraint_period_unmodeled"]),
    };
  }

  return { status: "available", dataCompleteness: COMPLETE_FAIRNESS_DATA };
}
