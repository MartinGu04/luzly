import "server-only";
import { resolveManagerDateRange } from "@/lib/domain/dateRange";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { parseEvent } from "@/lib/parsers/event";
import { parsePotentialSheet } from "@/lib/parsers/potential";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildManagerOverviewReadModel } from "./buildManagerOverviewReadModel";
import { getManagerWorkbookSheet, loadManagerWorkbookContext } from "./managerWorkbookContext";
import type { ManagerOverviewParams } from "./managerOverviewParams";
import type { ManagerOverviewReadModel } from "./managerTypes";

export type ManagerOverviewLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "configuration_error"; message: string }
  /** Authenticated + mapped, but `person.isManager !== true` -- no manager-wide fetch was ever performed. */
  | { status: "forbidden" }
  | { status: "ok"; model: ManagerOverviewReadModel };

/**
 * Server-only orchestration for `ManagerOverviewReadModel`. The
 * authorization + manager-wide fetch boundary itself lives in
 * `managerWorkbookContext.ts` (shared with Manager Fairness, PR #15 §4) --
 * this file only does what's specific to the overview: parsing
 * schedule/settings/Potential from the authorized snapshot, building the
 * shift schedule, resolving the requested date range, and building
 * `ManagerOverviewReadModel`.
 */
export async function loadManagerOverviewReadModel(
  params: ManagerOverviewParams,
): Promise<ManagerOverviewLoadResult> {
  const contextResult = await loadManagerWorkbookContext();
  if (contextResult.status !== "ok") return contextResult;

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

  const now = getJerusalemLocalNow();
  const range = resolveManagerDateRange(params.range, params.month, now);

  const model = buildManagerOverviewReadModel({
    manager,
    people,
    events,
    potentialAllocations,
    shiftSchedule,
    fetchedAt: snapshot.fetchedAt,
    now,
    range,
    selectedPersonId: params.personId,
    problemsOnly: params.problemsOnly,
  });

  return { status: "ok", model };
}
