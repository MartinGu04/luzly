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
import { classifyPersonnelType } from "@/lib/domain/personnelType";
import { EMPTY_RESERVE_ROLE_PARTICIPATION, type ReserveRoleParticipation } from "@/lib/domain/reserveParticipation";
import { computeShiftExpectationFactors } from "@/lib/domain/shiftExpectationFactors";
import type { Person } from "@/lib/domain/types";
import type { ShiftFairnessGroupView, ShiftFairnessPersonRowView, ShiftFairnessReadModel } from "./shiftFairnessTypes";

/**
 * PR #2 -- the pure, deterministic shift Fairness read-model builder. No
 * network, no auth, no `Date`/UTC, never mutates any input -- same
 * convention as `buildManagerFairnessReadModel.ts`. Computes BOTH
 * comparison groups (supervisor, technician) from `fairnessShiftEngine.ts`
 * and projects each into the safe `ShiftFairnessPersonRowView` shape,
 * looking up each row's display name and `serviceCategory` (PR #51 follow-
 * up, via `classifyPersonnelType`) from `people` (neither is carried by the
 * domain engine itself, which only ever deals in `personId`). This is the
 * single place `serviceCategory` is resolved -- the read model carries it
 * from here on, so downstream orchestration/UI never needs the full
 * `people` roster just to know a row's own service type.
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

  // periodStatus is threaded through explicitly -- a closed historical
  // month is modeled more conservatively than the current/open period (see
  // fairnessShiftEngine.ts's own docs for the current-vs-closed rule);
  // omitting this would silently fall back to "current" behavior for every
  // past month too.
  const supervisorGroup = computeShiftFairnessForGroup(
    "supervisor",
    people,
    events,
    periodDates,
    reserveParticipation,
    periodStatus,
  );
  const technicianGroup = computeShiftFairnessForGroup(
    "technician",
    people,
    events,
    periodDates,
    reserveParticipation,
    periodStatus,
  );

  return {
    fetchedAt,
    month: formatMonthParam(month),
    periodStartDate: periodDates[0] ?? null,
    periodEndDate: periodDates[periodDates.length - 1] ?? null,
    periodStatus,
    groups: [toGroupView(supervisorGroup, people, events), toGroupView(technicianGroup, people, events)],
  };
}

function toGroupView(
  group: ShiftFairnessGroupResult,
  people: readonly Person[],
  events: readonly Event[],
): ShiftFairnessGroupView {
  const peopleById = new Map(people.map((person) => [person.id, person]));

  // The exact same period this group's own target was computed over --
  // reused, never re-derived -- so the factor breakdown counts absences/
  // constraints over the identical window the target itself reflects.
  const periodStartDate = group.periodDates[0] ?? null;
  const periodEndDate = group.periodDates[group.periodDates.length - 1] ?? null;

  const rows: ShiftFairnessPersonRowView[] = group.people.map((personResult) => ({
    personId: personResult.personId,
    personName: peopleById.get(personResult.personId)?.name ?? "",
    serviceCategory: classifyPersonnelType(peopleById.get(personResult.personId)?.personnelType ?? null),
    actualShifts: personResult.actualShifts,
    target: personResult.target,
    deviation: personResult.deviation,
    status: personResult.status,
    weekendActualShifts: personResult.weekendActualShifts,
    weekendTarget: personResult.weekendTarget,
    weekendDeviation: personResult.weekendDeviation,
    weekendStatus: personResult.weekendStatus,
    weekendsWorked: personResult.weekendsWorked,
    dataCompleteness: personResult.dataCompleteness,
    // A null target has no "expected value" to explain -- never computed for those rows.
    expectationFactors:
      personResult.target !== null && periodStartDate !== null && periodEndDate !== null
        ? computeShiftExpectationFactors(events, personResult.personId, periodStartDate, periodEndDate)
        : null,
  }));

  return { role: group.role, rows };
}
