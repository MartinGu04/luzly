import type { CalendarMonthKey } from "@/lib/domain/calendarMonth";
import { formatMonthParam } from "@/lib/domain/calendarMonth";
import type { Event } from "@/lib/domain/event";
import {
  computeShiftFairnessForGroup,
  resolveShiftFairnessPeriodDates,
  resolveShiftFairnessPeriodStatus,
  type ShiftFairnessGroupResult,
} from "@/lib/domain/fairnessShiftEngine";
import type { LocalNow } from "@/lib/domain/localNow";
import { EMPTY_RESERVE_ROLE_PARTICIPATION, type ReserveRoleParticipation } from "@/lib/domain/reserveParticipation";
import type { Person } from "@/lib/domain/types";
import type { ShiftFairnessGroupView, ShiftFairnessPersonRowView, ShiftFairnessReadModel } from "./shiftFairnessTypes";

/**
 * PR #2 -- the pure, deterministic shift Fairness read-model builder. No
 * network, no auth, no `Date`/UTC, never mutates any input -- same
 * convention as `buildManagerFairnessReadModel.ts`. Computes BOTH
 * comparison groups (supervisor, technician) from `fairnessShiftEngine.ts`
 * and projects each into the safe `ShiftFairnessPersonRowView` shape,
 * looking up each row's display name from `people` (never carried by the
 * domain engine itself, which only ever deals in `personId`).
 *
 * No orchestration layer (Google fetch, auth, request-scoped caching) is
 * added yet -- there is no page to serve, and PR #48's existing
 * `loadManagerWorkbookContext`/`getWorkbookSnapshot` conventions are the
 * ones a future page's loader should reuse when it's built.
 */
export function buildShiftFairnessReadModel(
  people: readonly Person[],
  events: readonly Event[],
  month: CalendarMonthKey,
  now: LocalNow,
  fetchedAt: string,
  reserveParticipation: ReserveRoleParticipation = EMPTY_RESERVE_ROLE_PARTICIPATION,
): ShiftFairnessReadModel {
  const periodDates = resolveShiftFairnessPeriodDates(month, now);
  const periodStatus = resolveShiftFairnessPeriodStatus(month, now);

  const supervisorGroup = computeShiftFairnessForGroup("supervisor", people, events, periodDates, reserveParticipation);
  const technicianGroup = computeShiftFairnessForGroup("technician", people, events, periodDates, reserveParticipation);

  return {
    fetchedAt,
    month: formatMonthParam(month),
    periodStartDate: periodDates[0] ?? null,
    periodEndDate: periodDates[periodDates.length - 1] ?? null,
    periodStatus,
    groups: [toGroupView(supervisorGroup, people), toGroupView(technicianGroup, people)],
  };
}

function toGroupView(group: ShiftFairnessGroupResult, people: readonly Person[]): ShiftFairnessGroupView {
  const peopleById = new Map(people.map((person) => [person.id, person]));

  const rows: ShiftFairnessPersonRowView[] = group.people.map((personResult) => ({
    personId: personResult.personId,
    personName: peopleById.get(personResult.personId)?.name ?? "",
    actualShifts: personResult.actualShifts,
    target: personResult.target,
    deviation: personResult.deviation,
    status: personResult.status,
    weekendActualShifts: personResult.weekendActualShifts,
    weekendTarget: personResult.weekendTarget,
    weekendDeviation: personResult.weekendDeviation,
    weekendStatus: personResult.weekendStatus,
    dataCompleteness: personResult.dataCompleteness,
  }));

  return { role: group.role, rows };
}
