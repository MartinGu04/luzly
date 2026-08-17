import type { Event } from "./event";
import {
  combineFairnessDataCompleteness,
  COMPLETE_FAIRNESS_DATA,
  fairnessDataCompleteness,
  type FairnessDataCompleteness,
} from "./fairnessFoundation";
import {
  resolveFairnessParticipationWindow,
  resolveFairnessRoleEligibility,
  type FairnessParticipationWindow,
  type FairnessRoleEligibility,
} from "./fairnessParticipation";
import { classifyRoleGroup } from "./personnelType";
import { EMPTY_RESERVE_ROLE_PARTICIPATION, type ReserveRoleParticipation } from "./reserveParticipation";
import type { Person } from "./types";

/**
 * PR #48 -- Fairness COMPARISON groups: "people who can reasonably be
 * compared for the same workload", never blindly equated with official
 * organizational role/title. Grouping is driven ENTIRELY by capability
 * (`isSupervisor`/`isTechnician`) -- a person's actual rotation-participation
 * capability -- never by `personnelType` (קבע/חובה/מילואים is a SERVICE
 * category, orthogonal to which rotation someone works) and never by a
 * free-text role label. This is a genuinely SEPARATE concept from Duty
 * Fairness's own grouping (`resolveFairnessAllocationRole`,
 * `lib/domain/fairnessAnalysis.ts`, which classifies the Potential sheet's
 * own "הקצאה" TEXT for the h1/h2 duty table) -- that one stays exactly as
 * it is (PR #15's duty scoring is preserved, not replaced); this one is the
 * general foundation the shift Fairness engine (PR #2) builds on.
 *
 * A reservist אחמ״ש (or a person whose organizational title is ר״צ but who
 * actually works the אחמ״ש rotation, i.e. `isSupervisor === true`) lands in
 * the SAME `"supervisor"` group as every other אחמ״ש -- `מילואים`/`ר״צ` are
 * both real, but they are contextual metadata (personnelType /
 * a future role-metadata field), never a separate fairness group of their
 * own and never a reason to exclude someone from the group they actually
 * work in.
 *
 * RECONSIDERED (follow-up to this PR): the initial version reused
 * `classifyRoleGroup`'s three-way `"supervisor" | "technician" | "other"`
 * split (`lib/presentation/roster.ts`'s own roster-hierarchy grouping)
 * directly for Fairness, which forced every non-supervisor/non-technician
 * person into one shared `"other"` group -- a fabricated comparability
 * claim: nothing in today's data shows an אחר-bucket person is doing
 * comparable work to every OTHER אחר-bucket person (unlike supervisor/
 * technician, which really is one shared rotation each). `"other"` stays
 * exactly right for `roster.ts`'s presentation purpose (listing every
 * roster member somewhere, capability aside) -- it is simply the wrong
 * answer to "who can be fairly compared", so Fairness comparison groups
 * now cover ONLY `"supervisor"`/`"technician"`; a person who fits neither
 * gets `group: null` ("not assigned to a meaningful Fairness comparison
 * group") instead of being folded into an invented catch-all. This is not
 * a new grouping rule -- it reuses `classifyRoleGroup`'s own supervisor-
 * over-technician precedence unchanged, it only stops treating that
 * function's `"other"` result as if it meant "one more real group".
 */
export type FairnessComparisonGroupKey = "supervisor" | "technician";

export interface FairnessComparisonGroup {
  key: FairnessComparisonGroupKey;
  /** Deterministic, insertion order (the input roster's own order) -- never re-sorted here. */
  personIds: readonly string[];
}

const GROUP_ORDER: readonly FairnessComparisonGroupKey[] = ["supervisor", "technician"];

/**
 * `classifyRoleGroup`'s `"other"` result is translated to `null` here --
 * never treated as a third Fairness comparison group (see this file's own
 * top docstring for why).
 */
export function resolveFairnessComparisonGroupKey(person: Person): FairnessComparisonGroupKey | null {
  const roleGroup = classifyRoleGroup(person);
  return roleGroup === "other" ? null : roleGroup;
}

/**
 * Groups `people` by `resolveFairnessComparisonGroupKey` -- a person with no
 * meaningfully comparable group (`null`) is simply omitted from every
 * group, never forced into a catch-all; an empty group is likewise omitted,
 * never rendered as an empty bucket.
 */
export function buildFairnessComparisonGroups(people: readonly Person[]): FairnessComparisonGroup[] {
  const byGroup = new Map<FairnessComparisonGroupKey, string[]>();
  for (const person of people) {
    const key = resolveFairnessComparisonGroupKey(person);
    if (key === null) continue;
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(person.id);
    else byGroup.set(key, [person.id]);
  }

  const groups: FairnessComparisonGroup[] = [];
  for (const key of GROUP_ORDER) {
    const personIds = byGroup.get(key);
    if (!personIds || personIds.length === 0) continue;
    groups.push({ key, personIds });
  }
  return groups;
}

/**
 * One person's complete Fairness context for one period -- the "read-model
 * primitive" this foundation exists to provide: which comparison group they
 * belong to (`null` when nothing today proves them meaningfully comparable
 * to anyone -- see `resolveFairnessComparisonGroupKey`), their participation
 * window, their per-role eligibility, and one combined `dataCompleteness`
 * covering every fact that went into it (including `"fairness_group_unassigned"`
 * when `group` is `null`). Deliberately carries NO score/workload number --
 * that's future shift/duty scoring, explicitly out of scope for this PR.
 */
export interface FairnessPersonContext {
  personId: string;
  group: FairnessComparisonGroupKey | null;
  participation: FairnessParticipationWindow;
  /** Both roles are always resolved (`resolveFairnessRoleEligibility` itself decides `eligible: false` for a role the person has no capability for) -- never omitted, so a caller can always find "the" supervisor/technician entry without a lookup miss. */
  eligibility: readonly FairnessRoleEligibility[];
  dataCompleteness: FairnessDataCompleteness;
}

/**
 * Builds `person`'s `FairnessPersonContext` for one period. `events` may be
 * the full period's Event set for many people (every primitive this calls
 * filters to `person`'s own Events itself). `reserveParticipation` defaults
 * to empty -- the safe direction for a caller that hasn't resolved the
 * period's own Fairness-table evidence (see `reserveParticipation.ts`).
 */
export function buildFairnessPersonContext(
  person: Person,
  events: readonly Event[],
  periodStartDate: string,
  periodEndDate: string,
  reserveParticipation: ReserveRoleParticipation = EMPTY_RESERVE_ROLE_PARTICIPATION,
): FairnessPersonContext {
  const participation = resolveFairnessParticipationWindow(person, events, periodStartDate, periodEndDate);
  const eligibility: FairnessRoleEligibility[] = [
    resolveFairnessRoleEligibility(
      person,
      "supervisor",
      events,
      periodStartDate,
      periodEndDate,
      reserveParticipation,
    ),
    resolveFairnessRoleEligibility(
      person,
      "technician",
      events,
      periodStartDate,
      periodEndDate,
      reserveParticipation,
    ),
  ];

  const group = resolveFairnessComparisonGroupKey(person);

  return {
    personId: person.id,
    group,
    participation,
    eligibility,
    dataCompleteness: combineFairnessDataCompleteness([
      participation.dataCompleteness,
      ...eligibility.map((entry) => entry.dataCompleteness),
      group === null ? fairnessDataCompleteness(["fairness_group_unassigned"]) : COMPLETE_FAIRNESS_DATA,
    ]),
  };
}
