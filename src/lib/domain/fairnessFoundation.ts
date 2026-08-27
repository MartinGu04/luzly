import { addCalendarDays, formatCalendarDate } from "./dateRange";
import { dayOfWeek, parseCalendarDate } from "./dutyBlocks";
import type { LocalNow } from "./localNow";

/**
 * PR #48 -- the Fairness foundation's own calculation version, carried by
 * every structural result this module (and `fairnessParticipation.ts`/
 * `fairnessGroups.ts`) produces. This is what will eventually let a stored
 * historical snapshot be trusted without recalculating it against a future,
 * possibly-different version of these rules -- see this PR's own README
 * entry for why no snapshot STORAGE exists yet. Bump this only when a rule
 * in this foundation actually changes in a way that would change a past
 * result.
 */
export const FAIRNESS_MODEL_VERSION = 1;

// ---------------------------------------------------------------------------
// Current vs. closed period
// ---------------------------------------------------------------------------

export type FairnessPeriodStatus = "current" | "closed";

// ---------------------------------------------------------------------------
// Shared status vocabulary -- both Fairness modes report a person's standing
// with the SAME three words, even though each mode computes it differently
// (PR #3): Shift Fairness (`fairnessShiftEngine.ts`) applies a
// ±0.5-shift tolerance band around an opportunity-based target; Duty
// Fairness (`fairnessAnalysis.ts`) is an EXACT currentScore-vs-comparisonTarget
// comparison with no tolerance at all. Sharing the vocabulary (not the
// computation) is the point -- see this module's own docs and PR #3's README
// entry for why the two engines stay separate.
// ---------------------------------------------------------------------------

export type FairnessStatus = "below" | "balanced" | "above";

/**
 * A period is "closed" once its own end date is strictly before `now.date`
 * -- otherwise (including the end date itself, still in progress) it's
 * "current". Deliberately period-SHAPE-agnostic: takes a plain end date
 * string, not a `FairnessPeriodKey`/month/etc., so it works identically for
 * the existing h1/h2 duty period (`lib/domain/fairnessPeriod.ts`) and a
 * future shift-fairness period (e.g. a calendar month) without this module
 * needing to know either shape. An unparseable `periodEndDate` is treated
 * as "current" -- never fabricate a "closed" verdict from bad input.
 */
export function resolveFairnessPeriodStatus(periodEndDate: string, now: LocalNow): FairnessPeriodStatus {
  if (!parseCalendarDate(periodEndDate)) return "current";
  return periodEndDate < now.date ? "closed" : "current";
}

// ---------------------------------------------------------------------------
// Data completeness -- the model must never manufacture certainty where
// source data is genuinely incomplete (see this PR's own README entry).
// ---------------------------------------------------------------------------

/**
 * Every reason a piece of Fairness data is only partially known today.
 * Centralized here (not re-invented per primitive) so a future UI can map
 * ALL of them to one consistent "נתונים חלקיים" treatment. Each reason names
 * a REAL, currently-verified gap in the source data -- never a placeholder
 * for a hypothetical one:
 *
 * - `participation_assumed_full_period` -- a participation window came from
 *   `full_period`, itself only an ASSUMPTION for permanent/regular
 *   personnel (this app's existing default treatment of them elsewhere,
 *   e.g. `lib/presentation/roster.ts`'s roster listing), never a verified
 *   stored join/leave date -- none exists today for anyone, of any
 *   personnel type. Assumed participation must never be presented with the
 *   same confidence as verified participation.
 * - `participation_inferred` -- a participation window came from
 *   `inferred_from_events` (first/last Event evidence within the period),
 *   never an authoritative stored join/leave date (none exists today).
 * - `participation_unknown` -- no evidence at all was found to bound a
 *   reserve/unclassified person's participation.
 * - `eligibility_undated` -- role capability (`isTechnician`/`isSupervisor`)
 *   is a CURRENT snapshot only; כ"א carries no effective-from date, so a
 *   qualification change partway through a period can never be time-sliced
 *   -- the same current flag is applied to the whole period.
 * - `constraint_period_unmodeled` -- a `constraint` Event exists whose
 *   `period` ("morning") has no canonical day/night shift-slot mapping (see
 *   `resolveFairnessShiftOpportunity`) -- its effect on availability is
 *   real but not represented here, never silently dropped OR silently
 *   treated as blocking.
 * - `fairness_group_unassigned` -- a person is neither supervisor- nor
 *   technician-capable, so no comparison group they belong to has been
 *   PROVEN comparable by today's data -- see `fairnessGroups.ts`.
 * - `shift_target_no_group_opportunities` -- PR #2's shift Fairness engine
 *   (`fairnessShiftEngine.ts`) found real, evidenced workload from the
 *   group's MODELABLE members (people whose CURRENT capability flag
 *   actually matches the role -- see `shift_target_unmodelable_evidence_only`
 *   below for the separate, non-modelable case) that it could not
 *   attribute to ANY valid opportunity among that same modelable pool --
 *   workload actually happened, but nothing in today's data explains who
 *   among the people who COULD be modeled was genuinely positioned to do
 *   it, so every MODELABLE member's personal target computes to a real 0
 *   (via the share formula's own divide-by-zero guard) instead of a real
 *   proportional share -- an evidence-only member's target stays `null`
 *   regardless, per its own reason above. This is deliberately NOT raised
 *   merely because
 *   both the modelable workload and the modelable opportunity count are
 *   zero (an idle group/subset, or an empty period, with nothing to
 *   distribute) -- that is a normal, complete outcome, not a gap. This is
 *   a group-level fact, not a per-person one -- it is attached to every
 *   member's own `dataCompleteness` so a per-person view never looks
 *   confidently "balanced" while the underlying target was never really
 *   computable.
 * - `shift_target_unmodelable_evidence_only` -- for a CURRENT period: this
 *   person is a comparison-group member ONLY because of real confirmed
 *   shift evidence, not because `role` is their PRIMARY rotation (see
 *   `fairnessShiftEngine.ts`'s `isRoleComparisonMember`) -- either their
 *   CURRENT capability doesn't include `role` at all, or `role` is merely
 *   their secondary capability (a dual-capable person's normal rotation is
 *   their primary one only). Their real `actualShifts` stays visible, but
 *   their personal `target`/`deviation`/`status` are `null` (never
 *   computed, never a guessed `0`), and -- critically -- their workload is
 *   EXCLUDED from the group total redistributed onto other members'
 *   targets: not being able to model this person's own opportunities is
 *   never treated as license to silently hand their workload to someone
 *   else's fair-share calculation.
 * - `shift_target_unmodelable_historical` -- for a CLOSED historical
 *   period ONLY: current capability/primary-rotation status is NOT treated
 *   as proof of historical qualification timing (final PR #2 audit --
 *   `isTechnician`/`isSupervisor` are undated, so "this is their rotation
 *   today" does not establish "this was their rotation throughout that
 *   past period"). A closed period's `target`/`deviation`/`status` are
 *   only ever real numbers when genuinely period-DATED evidence exists
 *   (the Fairness sheet's own allocation for THAT specific historical
 *   period, reused via `reserveParticipation` -- never invented, never a
 *   new qualification-date or inference rule); everyone else's real
 *   `actualShifts` stays visible, but `null` otherwise -- one confirmed
 *   historical shift is real evidence of THAT shift, never proof of a
 *   whole period's worth of opportunities.
 * - `duty_identity_unresolved` -- PR #3's Duty Fairness read model
 *   (`buildDutyFairnessReadModel.ts`): the Fairness table's own row name
 *   (`FairnessPersonRow.sourceName`) did not resolve to exactly one
 *   personnel record (`resolvedPersonId === null` -- zero or duplicate
 *   matches, see `parseFairnessTable`'s own resolution rule). The row
 *   itself is still real, valid source data and stays fully visible
 *   (score/target/status all still compute normally) -- only the link to a
 *   stable person id is missing.
 * - `duty_target_unavailable` -- PR #3's Duty Fairness read model: this
 *   row's `allocationLabel` DOES resolve to a deterministic target role
 *   (`resolveFairnessAllocationRole` -- 'אחמ"ש'/"טכנאי"), but the period's
 *   own X/2X target note could not be found or parsed
 *   (`resolveComparisonTarget` returned `null` despite a known role), so
 *   `comparisonTarget`/`gapToTarget`/`normalizedLoad`/`status` are all
 *   unavailable for this row even though it is clearly a target-bearing
 *   role. Deliberately NOT raised for a row whose allocation label has no
 *   deterministic role at all (e.g. "הסמכה", "ר\"צ", an unrecognized
 *   label) -- a non-target-bearing row having `comparisonTarget: null` is
 *   the normal, complete, expected outcome, not a gap (never noise on
 *   every row).
 * - `duty_allocation_unsupported_block_shape` -- the "הקצאות שבוצעו" weighted
 *   allocation total (`lib/domain/dutyAllocationWeight.ts`'s
 *   `computeCompletedDutyAllocation`): this person has at least one real,
 *   CONFIRMED guard/reserve block overlapping the effective range whose
 *   shape matches none of the three confirmed business-rule shapes
 *   (single-day, 3-day Mon-Wed half-week, 4-day Thu-Sun weekend) --
 *   `computeCompletedDutyAllocation` deliberately refuses to guess a weight
 *   for it, so the WHOLE total is `null` rather than a partial sum that
 *   silently drops the unclassifiable block's real contribution.
 * - `duty_weekend_count_emergency_period` -- Emergency Mode audit (spec
 *   section 19/22): `FairnessPersonRow.weekendCount` is parsed as ONE raw
 *   aggregate number per person per H1/H2 period straight off the
 *   workbook's own `סופ"שים` column (`lib/parsers/fairness.ts`) -- there is
 *   no per-date breakdown anywhere in the source, so it is IMPOSSIBLE to
 *   trustworthily subtract emergency-affected weekends from it. Rather than
 *   inventing a recomputation, `buildDutyFairnessReadModel` nulls the whole
 *   value out (never a partial/guessed adjustment) whenever the selected
 *   period overlaps at least one date any recorded Emergency Mode period
 *   ever touched -- this is a PERIOD-level fact (like
 *   `shift_target_no_group_opportunities`), attached identically to every
 *   row in that period, regardless of whether that specific person was
 *   personally on desk during the emergency.
 */
export type FairnessDataCompletenessReason =
  | "participation_assumed_full_period"
  | "participation_inferred"
  | "participation_unknown"
  | "eligibility_undated"
  | "constraint_period_unmodeled"
  | "fairness_group_unassigned"
  | "shift_target_unmodelable_evidence_only"
  | "shift_target_unmodelable_historical"
  | "shift_target_no_group_opportunities"
  | "duty_identity_unresolved"
  | "duty_target_unavailable"
  | "duty_allocation_unsupported_block_shape"
  | "duty_weekend_count_emergency_period";

export interface FairnessDataCompleteness {
  status: "complete" | "partial";
  /** Deduplicated, insertion-order preserved. Empty iff `status === "complete"`. */
  reasons: readonly FairnessDataCompletenessReason[];
}

export const COMPLETE_FAIRNESS_DATA: FairnessDataCompleteness = { status: "complete", reasons: [] };

/** Builds a `FairnessDataCompleteness` from zero or more reasons -- empty/no reasons means complete, matching `COMPLETE_FAIRNESS_DATA`. */
export function fairnessDataCompleteness(
  reasons: readonly FairnessDataCompletenessReason[],
): FairnessDataCompleteness {
  if (reasons.length === 0) return COMPLETE_FAIRNESS_DATA;
  return { status: "partial", reasons: [...new Set(reasons)] };
}

/** Merges several `FairnessDataCompleteness` facts (e.g. participation + eligibility + availability for one person) into one -- partial if ANY part is partial, reasons deduplicated and order-preserved. Never mutates its input. */
export function combineFairnessDataCompleteness(
  parts: readonly FairnessDataCompleteness[],
): FairnessDataCompleteness {
  return fairnessDataCompleteness(parts.flatMap((part) => part.reasons));
}

// ---------------------------------------------------------------------------
// Weekend identification -- shared foundation for weekend metrics that will
// be computed independently for shifts and for duties (never one arbitrary
// shared weight like "weekend shift = 1.7 normal shifts").
// ---------------------------------------------------------------------------

/** 0=Sunday .. 6=Saturday (`dayOfWeek`'s own convention). */
const WEEKEND_START_DAY_OF_WEEK = 4; // Thursday

/**
 * Thursday-Friday-Saturday -- the SAME Israeli-weekend convention already
 * established twice in this codebase (`dutyBlocks.ts`'s `weekend_kitchen`
 * Thursday-anchored completeness check, and `calendarMonth.ts`'s
 * `isWeekendColumn`), centralized here as the one date-string-based version
 * so a future weekend metric never re-derives or drifts from either. An
 * unparseable date is never treated as a weekend -- never a guess.
 */
export function isFairnessWeekendDate(dateStr: string): boolean {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return false;
  return dayOfWeek(parsed) >= WEEKEND_START_DAY_OF_WEEK;
}

/** How many of `dates` fall on the Thu-Fri-Sat weekend -- duplicates in `dates` are counted as given, never deduplicated (that's the caller's own concern). */
export function countFairnessWeekendDates(dates: readonly string[]): number {
  return dates.filter(isFairnessWeekendDate).length;
}

/**
 * The stable weekend-BLOCK key for `dateStr` -- Thursday, Friday, and
 * Saturday of the SAME Thu-Sat block all resolve to this identical string
 * (that block's own Saturday date), so collecting distinct keys into a
 * `Set` counts distinct WEEKENDS worked, never weekend DAYS or shift-slots
 * (a real user was confused by a Shift Fairness weekend metric that
 * actually counted the latter -- 3 shifts across one real Thu-Fri-Sat
 * weekend read as "3", not "1"). `null` for a date that isn't itself a
 * weekend date at all (see `isFairnessWeekendDate`) -- callers should only
 * call this once `isFairnessWeekendDate(dateStr)` is already known true,
 * same convention as this file's other weekend helpers.
 *
 * Saturday is chosen as the canonical anchor (rather than Thursday) purely
 * because `addCalendarDays` only ever adds forward -- Thu is 2 days before
 * its own Saturday, Fri is 1 day before, Sat is 0 days before, so every
 * case is a non-negative offset with no separate "days before" arithmetic
 * needed. The anchor choice itself carries no other meaning.
 */
export function fairnessWeekendBucketKey(dateStr: string): string | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return null;

  const weekday = dayOfWeek(parsed);
  if (weekday < WEEKEND_START_DAY_OF_WEEK) return null;

  const SATURDAY = 6;
  return formatCalendarDate(addCalendarDays(parsed, SATURDAY - weekday));
}
