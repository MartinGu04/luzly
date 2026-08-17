import type { Event } from "./event";
import { combineFairnessDataCompleteness, type FairnessDataCompleteness } from "./fairnessFoundation";
import {
  resolveFairnessParticipationWindow,
  resolveFairnessRoleEligibility,
  type FairnessParticipationWindow,
  type FairnessRoleEligibility,
} from "./fairnessParticipation";
import { classifyRoleGroup, type FairnessRoleGroupKey } from "./personnelType";
import { EMPTY_RESERVE_ROLE_PARTICIPATION, type ReserveRoleParticipation } from "./reserveParticipation";
import type { Person } from "./types";

/**
 * PR #48 -- Fairness COMPARISON groups: "people who can reasonably be
 * compared for the same workload", never blindly equated with official
 * organizational role/title. Grouping is driven ENTIRELY by
 * `classifyRoleGroup` (`isSupervisor`/`isTechnician` capability flags,
 * `lib/domain/personnelType.ts`) -- a person's actual rotation-participation
 * capability -- never by `personnelType` (קבע/חובה/מילואים is a SERVICE
 * category, orthogonal to which rotation someone works) and never by a
 * free-text role label. This is a genuinely SEPARATE concept from the
 * existing duty-fairness grouping
 * (`lib/presentation/managerFairnessGrouping.ts`'s
 * `resolveFairnessAllocationRole`, which classifies the Potential sheet's
 * own "הקצאה" TEXT for the h1/h2 duty table) -- that one stays exactly as
 * it is (PR #15's duty scoring is preserved, not replaced); this one is the
 * general foundation a future combined/shift Fairness page builds on.
 *
 * A reservist אחמ״ש (or a person whose organizational title is ר״צ but who
 * actually works the אחמ״ש rotation, i.e. `isSupervisor === true`) lands in
 * the SAME `"supervisor"` group as every other אחמ״ש -- `מילואים`/`ר״צ` are
 * both real, but they are contextual metadata (personnelType /
 * a future role-metadata field), never a separate fairness group of their
 * own and never a reason to exclude someone from the group they actually
 * work in.
 */
export interface FairnessComparisonGroup {
  key: FairnessRoleGroupKey;
  /** Deterministic, insertion order (the input roster's own order) -- never re-sorted here. */
  personIds: readonly string[];
}

const GROUP_ORDER: readonly FairnessRoleGroupKey[] = ["supervisor", "technician", "other"];

/** Groups `people` by `classifyRoleGroup` -- every person appears in exactly one group; an empty group is omitted, never rendered as an empty bucket. */
export function buildFairnessComparisonGroups(people: readonly Person[]): FairnessComparisonGroup[] {
  const byGroup = new Map<FairnessRoleGroupKey, string[]>();
  for (const person of people) {
    const key = classifyRoleGroup(person);
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
 * belong to, their participation window, their per-role eligibility, and
 * one combined `dataCompleteness` covering every fact that went into it.
 * Deliberately carries NO score/workload number -- that's future shift/duty
 * scoring, explicitly out of scope for this PR.
 */
export interface FairnessPersonContext {
  personId: string;
  group: FairnessRoleGroupKey;
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

  return {
    personId: person.id,
    group: classifyRoleGroup(person),
    participation,
    eligibility,
    dataCompleteness: combineFairnessDataCompleteness([
      participation.dataCompleteness,
      ...eligibility.map((entry) => entry.dataCompleteness),
    ]),
  };
}
