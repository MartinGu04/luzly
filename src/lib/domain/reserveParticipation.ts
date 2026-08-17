import { resolveFairnessAllocationRole } from "./fairnessAnalysis";
import type { FairnessPeriodIdentity } from "./fairnessPeriod";
import type { FairnessPersonRow } from "./fairnessTable";

/**
 * PR #39 -- the minimal, safe projection of ONE Potential sheet's Fairness
 * table into "who does the current allocation prove is actively working
 * which role, right now" -- nothing else. Deliberately just two id sets,
 * never the raw `FairnessPersonRow[]` (scores, exemptions, sourceCell,
 * weekend counts): `buildShiftCoverageRecommendation` must never see
 * Fairness SCORES or source metadata, only "is this person id currently
 * proven to participate in this role's rotation".
 */
export interface ReserveRoleParticipation {
  technicianPersonIds: ReadonlySet<string>;
  supervisorPersonIds: ReadonlySet<string>;
}

export const EMPTY_RESERVE_ROLE_PARTICIPATION: ReserveRoleParticipation = {
  technicianPersonIds: new Set(),
  supervisorPersonIds: new Set(),
};

/**
 * One half-year Potential/Fairness sheet's participation evidence, tagged
 * with the calendar YEAR that source sheet actually represents (PR #39
 * follow-up -- "year-safe Fairness evidence"). `year` comes from
 * structurally parsing the real source tab name
 * (`lib/google/parseSourcePeriodYear`), never from "now" and never
 * hardcoded -- the currently configured `potentialH1`/`potentialH2` tabs
 * only ever cover ONE specific year at a time (e.g. "1-6/2026"), and an
 * issue from a different year must never silently borrow that evidence
 * just because it also resolves to "h1". `null` when the source tab name
 * doesn't carry a parseable year at all -- treated as "never a match",
 * never a guess.
 */
export interface ReserveRoleParticipationSource {
  year: number | null;
  participation: ReserveRoleParticipation;
}

/**
 * Both half-year Potential sheets' Fairness participation, computed once
 * per manager-overview load -- the caller resolves which ONE side (and
 * whether its year actually matches) applies to a specific issue via
 * `resolveReserveRoleParticipation` below. Both sides are already
 * available from the SAME manager workbook snapshot every manager feature
 * already fetches (PR #15) -- this never triggers a second/extra Google
 * request.
 */
export interface ReserveRoleParticipationByPeriod {
  h1: ReserveRoleParticipationSource;
  h2: ReserveRoleParticipationSource;
}

/**
 * The ONE centralized place "does this evidence source actually apply to
 * the requested period?" is decided (PR #39 follow-up) -- every caller
 * (currently just `buildManagerOverviewReadModel`) goes through this
 * rather than re-deriving/comparing years itself. Picks the `key`-matching
 * side of `byPeriod`, then requires its `year` to EXACTLY equal
 * `requested.year` -- a same-half-different-year source (e.g. h1-2026
 * evidence requested for an h1-2027 issue) or an unparseable source year
 * (`null`) both fall back to `EMPTY_RESERVE_ROLE_PARTICIPATION`, the safe
 * "no evidence" direction, never a guess forward/backward across years.
 */
export function resolveReserveRoleParticipation(
  byPeriod: ReserveRoleParticipationByPeriod,
  requested: FairnessPeriodIdentity,
): ReserveRoleParticipation {
  const source = byPeriod[requested.key];
  if (source.year === null || source.year !== requested.year) return EMPTY_RESERVE_ROLE_PARTICIPATION;
  return source.participation;
}

/**
 * Derives `ReserveRoleParticipation` from one already-parsed Fairness
 * table's person rows (`parseFairnessTable().personRows` -- reuses the
 * existing PR #15 parser outright, never a second one). A row counts as
 * evidence for role R only when BOTH:
 *
 * 1. `resolvedPersonId` is non-null -- the sheet's own name resolved to
 *    EXACTLY ONE personnel record (never ambiguous/duplicate, per
 *    `parseFairnessTable`'s own resolution rule);
 * 2. `resolveFairnessAllocationRole(allocationLabel)` resolves to R -- an
 *    unrecognized allocation label (anything other than "טכנאי"/'אחמ"ש')
 *    contributes to neither set.
 *
 * Scores/exemptions/weekend counts are never read here -- this is
 * participation evidence only, never a fairness/ranking signal. If the
 * same person appears in the table more than once (not expected in
 * practice, but never assumed impossible), every qualifying row still just
 * adds to the same id set -- a `Set` is naturally idempotent.
 */
export function deriveReserveRoleParticipation(
  personRows: readonly FairnessPersonRow[],
): ReserveRoleParticipation {
  const technicianPersonIds = new Set<string>();
  const supervisorPersonIds = new Set<string>();

  for (const row of personRows) {
    if (row.resolvedPersonId === null) continue;
    const role = resolveFairnessAllocationRole(row.allocationLabel);
    if (role === "technician") technicianPersonIds.add(row.resolvedPersonId);
    else if (role === "supervisor") supervisorPersonIds.add(row.resolvedPersonId);
  }

  return { technicianPersonIds, supervisorPersonIds };
}
