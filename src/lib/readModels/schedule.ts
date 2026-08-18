import "server-only";
import { calendarMonthOfLocalNow, formatMonthParam, parseMonthParam } from "@/lib/domain/calendarMonth";
import { resolveManagerDateRange } from "@/lib/domain/dateRange";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { SheetSourceKey } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parsePotentialSheet } from "@/lib/parsers/potential";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { buildManagerScheduleReadModel, buildSelfOnlyScheduleReadModel } from "./buildScheduleReadModel";
import { getManagerWorkbookSheet, loadManagerWorkbookContext } from "./managerWorkbookContext";
import { getRequestPersonalSchedule } from "./getRequestPersonalSchedule";
import type { ScheduleReadModel } from "./scheduleTypes";

export type ScheduleLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "configuration_error"; message: string }
  | { status: "ok"; model: ScheduleReadModel };

/**
 * Everything the Schedule feature ever needs, for a normal user OR a
 * manager in any of the three perspectives -- personnel + schedule +
 * settings + potentialH1/H2. PR #24 §25 originally kept this narrower than
 * `MANAGER_WORKBOOK_SOURCES` (no Potential at all) since only Manager
 * Overview's reconciliation section needed it; a later duty-completeness
 * pass (see `buildPersonalScheduleReadModel.ts`) reuses the SAME Potential
 * data for the "self"/"person" perspectives (never "all" -- unit-wide
 * staffing/coverage stays out of scope for this source), so it's fetched
 * here too now.
 */
const SCHEDULE_MANAGER_SOURCES: SheetSourceKey[] = [
  "personnel",
  "schedule",
  "settings",
  "potentialH1",
  "potentialH2",
];

export interface ScheduleParams {
  /** Raw, unvalidated `?month=` value ("YYYY-MM" or anything else) -- this loader resolves the "today" fallback itself from the shared personal read model's own `localNow`, the same `calendarMonthOfLocalNow` convention the page uses for display. Never trusted without `parseMonthParam`. */
  rawMonth: string | null;
  /** Raw, unvalidated `?person=` value. Completely ignored for a normal (non-manager) user -- see `loadScheduleReadModel`. */
  personId: string | null;
}

/**
 * Server-only orchestration for `ScheduleReadModel` (PR #24). Mirrors
 * `managerOverview.ts`'s split between authorization/fetch (this file) and
 * pure construction (`buildScheduleReadModel.ts`):
 *
 * 1. Reuses `getRequestPersonalSchedule()` -- the SAME request-scoped
 *    result the protected layout and `/schedule` itself already compute
 *    (react `cache()` dedupes this to zero extra calls) -- as the FIRST
 *    authorization gate, exactly like `managerWorkbookContext.ts`.
 * 2. A normal (non-manager) user's `?person=` is never even inspected --
 *    the server-side floor is unconditional, not merely a UI choice. This
 *    is what PR #24 §3 requires: `?person=all` or `?person=<id>` must
 *    still only ever return that person's own schedule.
 * 3. Only once `person.isManager === true` does this fetch anything more
 *    -- `loadManagerWorkbookContext(SCHEDULE_MANAGER_SOURCES)`, ONE
 *    additional Google request, going through the exact same fail-closed
 *    re-verification (fresh identity, fresh personnel parse, fresh
 *    manager check) every other manager-only feature uses. If that fresh
 *    check can't be re-proven for this request (e.g. a race between the
 *    two fetches), this fails closed to the exact same self-only
 *    experience a normal user gets -- never a manager selector/data the
 *    fresh check couldn't currently verify.
 * 4. Parses schedule + settings + potentialH1/H2 from the authorized
 *    manager snapshot, resolves the displayed month's dates, and delegates
 *    all read-model construction to the pure `buildManagerScheduleReadModel`.
 */
export async function loadScheduleReadModel(params: ScheduleParams): Promise<ScheduleLoadResult> {
  const personalResult = await getRequestPersonalSchedule();

  if (personalResult.status === "unauthenticated") return { status: "unauthenticated" };
  if (personalResult.status === "missing_email") return { status: "missing_email" };
  if (personalResult.status === "unmapped") return { status: "unmapped" };
  if (personalResult.status === "ambiguous_identity") return { status: "ambiguous_identity" };
  if (personalResult.status === "configuration_error") {
    return { status: "configuration_error", message: personalResult.message };
  }

  const { model: selfModel } = personalResult;

  if (!selfModel.person.isManager) {
    return { status: "ok", model: buildSelfOnlyScheduleReadModel(selfModel) };
  }

  const currentMonthKey = calendarMonthOfLocalNow(selfModel.localNow);
  const displayMonthKey = parseMonthParam(params.rawMonth) ?? currentMonthKey;
  const monthParam = formatMonthParam(displayMonthKey);

  const contextResult = await loadManagerWorkbookContext(SCHEDULE_MANAGER_SOURCES);
  if (contextResult.status !== "ok") {
    // Fresh re-verification couldn't reconfirm manager status for THIS
    // request (e.g. personnel changed between the two fetches) -- fail
    // closed to the same self-only experience a normal user gets, rather
    // than surfacing an error for someone who is still a fully authorized
    // person, just not (right now) provably a manager.
    return { status: "ok", model: buildSelfOnlyScheduleReadModel(selfModel) };
  }

  const { manager, people, snapshot } = contextResult.context;

  const settings = parseSettingsSheet(getManagerWorkbookSheet(snapshot, "settings"));

  let shiftSchedule: ShiftSchedule;
  try {
    shiftSchedule = buildShiftSchedule(settings.shiftStartTimeDay);
  } catch (error) {
    if (error instanceof ShiftConfigurationError) {
      return { status: "configuration_error", message: error.message };
    }
    throw error;
  }

  const rawAssignments = parseScheduleSheet(getManagerWorkbookSheet(snapshot, "schedule"), people);
  const events = rawAssignments.map(parseEvent);

  const potentialAllocations = [
    ...parsePotentialSheet(getManagerWorkbookSheet(snapshot, "potentialH1"), people),
    ...parsePotentialSheet(getManagerWorkbookSheet(snapshot, "potentialH2"), people),
  ];

  const range = resolveManagerDateRange("month", monthParam, selfModel.localNow);

  const model = buildManagerScheduleReadModel({
    manager,
    people,
    events,
    shiftSchedule,
    fetchedAt: snapshot.fetchedAt,
    now: selfModel.localNow,
    monthDates: range.dates,
    requestedPersonId: params.personId,
    potentialAllocations,
  });

  return { status: "ok", model };
}
