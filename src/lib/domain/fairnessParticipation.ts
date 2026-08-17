import { BLOCKING_ABSENCE_KINDS } from "./operationalIssues";
import type { Event, EventPeriod } from "./event";
import {
  COMPLETE_FAIRNESS_DATA,
  fairnessDataCompleteness,
  type FairnessDataCompleteness,
} from "./fairnessFoundation";
import { classifyPersonnelType } from "./personnelType";
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
 * Deliberately reuses -- never re-derives -- the existing evidenced rules
 * this codebase already established for the closest existing concept
 * (`shiftCoverageRecommendation.ts`'s PR #37/#39 "participates in role R's
 * rotation" check): `classifyPersonnelType`'s permanent/regular/reserve/
 * unclassified categories, and `ReserveRoleParticipation`'s Fairness-table
 * evidence. This is intentionally a SEPARATE primitive, not a call into
 * `shiftCoverageRecommendation.ts` itself -- that module's rules are scoped
 * to one operational issue's date+missing-interval, evaluating shift/
 * absence/constraint OVERLAP against a specific gap; Fairness reasons over
 * a whole PERIOD instead, evaluating overall participation and per-day
 * shift-slot opportunity independently of any specific coverage problem.
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
 * today's data. `"inferred_from_events"` (reserve/unclassified personnel)
 * is a heuristic lower bound/upper bound from actual Event evidence in the
 * period, not an authoritative window either -- a reservist can easily have
 * gaps in their own recorded Events within their real service window (no
 * shift that particular day is normal, not evidence of having left) -- so
 * this window is always a CONSERVATIVE evidence range, never asserted as
 * the person's literal first/last day of service. Both limitations are
 * reflected honestly via `dataCompleteness`, never hidden.
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
 *   whole period, `dataCompleteness` complete (this app's existing default
 *   assumption for these two categories, not new to this function).
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
      dataCompleteness: COMPLETE_FAIRNESS_DATA,
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
  | "permanent_excluded"
  | "regular_included"
  | "reserve_evidence"
  | "reserve_no_evidence"
  | "unclassified_excluded";

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
 * Whether `person` is eligible for role R's rotation this period --
 * mirrors `shiftCoverageRecommendation.ts`'s PR #39 `participatesInRoleRotation`
 * rule exactly (a deliberate, evidenced business rule, not incidental to
 * that feature): no capability flag -> never; permanent-service -> never,
 * regardless of capability; regular-service -> always, once capable; reserve
 * -> capability alone is NOT enough, needs the period's own Fairness-table
 * evidence (`reserveParticipation`, from `deriveReserveRoleParticipation` /
 * `resolveReserveRoleParticipation`) OR at least one CONFIRMED same-role
 * shift Event within the period; unclassified -> never (never guessed from
 * silence). `reserveParticipation` defaults to empty -- the safe direction,
 * only ever making a reservist LESS likely to qualify, never more.
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
  const hasCapability = role === "technician" ? person.isTechnician : person.isSupervisor;

  if (!hasCapability) {
    return { personId: person.id, role, eligible: false, basis: "not_capable", dataCompleteness };
  }

  const category = classifyPersonnelType(person.personnelType);

  if (category === "permanent") {
    return { personId: person.id, role, eligible: false, basis: "permanent_excluded", dataCompleteness };
  }
  if (category === "regular") {
    return { personId: person.id, role, eligible: true, basis: "regular_included", dataCompleteness };
  }
  if (category !== "reserve") {
    return { personId: person.id, role, eligible: false, basis: "unclassified_excluded", dataCompleteness };
  }

  const fairnessEvidence =
    role === "technician" ? reserveParticipation.technicianPersonIds : reserveParticipation.supervisorPersonIds;
  if (fairnessEvidence.has(person.id)) {
    return { personId: person.id, role, eligible: true, basis: "reserve_evidence", dataCompleteness };
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
    basis: hasConfirmedSameRoleShiftInPeriod ? "reserve_evidence" : "reserve_no_evidence",
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
