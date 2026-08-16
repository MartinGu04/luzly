import { resolveFairnessAllocationRole } from "./fairnessAnalysis";
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
 * Both half-year Potential sheets' Fairness participation, computed once
 * per manager-overview load -- the caller then picks ONE side (via
 * `resolveFairnessPeriod`, keyed off each individual issue's OWN date, not
 * a single "now") when it's time to build a specific issue's
 * recommendation. Both sides are already available from the SAME manager
 * workbook snapshot every manager feature already fetches (PR #15) -- this
 * never triggers a second/extra Google request.
 */
export interface ReserveRoleParticipationByPeriod {
  h1: ReserveRoleParticipation;
  h2: ReserveRoleParticipation;
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
