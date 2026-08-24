import "server-only";
import { classifyPersonnelType } from "@/lib/domain/personnelType";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { parseEvent } from "@/lib/parsers/event";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildPermanentManagerHomeReadModel } from "./buildPermanentManagerHomeReadModel";
import { getManagerWorkbookSheet, loadManagerWorkbookContext } from "./managerWorkbookContext";
import type { PermanentManagerHomeReadModel } from "./permanentManagerHomeTypes";

export type PermanentManagerHomeLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "configuration_error"; message: string }
  /**
   * Authenticated + mapped, but not BOTH permanent AND manager -- the
   * caller must render the normal personal Dashboard instead, never this.
   * The shared workbook batch may already have been fetched by this point
   * (either to resolve `isManager` in `loadManagerWorkbookContext()`, or
   * -- for a real manager who simply isn't permanent -- fetched AND used
   * to read `manager.personnelType`); no `PermanentManagerHomeReadModel`
   * is ever built or returned either way. See `managerWorkbookContext.ts`'s
   * "Is fetching before the manager check safe?" for why that's fine.
   */
  | { status: "forbidden" }
  | { status: "ok"; model: PermanentManagerHomeReadModel };

/**
 * Everything the permanent-manager Home needs on top of the shared manager
 * boundary -- personnel + schedule + settings only, deliberately never
 * potentialH1/H2 (the spec explicitly rules Potential out for this Home;
 * `/manager`'s own Potential reconciliation stays exactly where it is).
 */
const PERMANENT_MANAGER_HOME_SOURCES = ["personnel", "schedule", "settings"] as const;

/**
 * Server-only orchestration for `PermanentManagerHomeReadModel`.
 *
 * Reuses `loadManagerWorkbookContext` for the SAME manager-only
 * authorization + workbook-fetch boundary every other manager feature uses
 * (re-verified `isManager` against a fresh snapshot, defense in depth) --
 * never a separate/weaker check. On top of that, this Home is further
 * restricted to a permanent (קבע) manager specifically: a non-permanent
 * manager is authorized to reach `/manager` as always, but never receives
 * this department-wide snapshot on `/` -- checked here too (not only by
 * the page) so this loader fails closed even if called directly.
 */
export async function loadPermanentManagerHomeReadModel(): Promise<PermanentManagerHomeLoadResult> {
  const contextResult = await loadManagerWorkbookContext([...PERMANENT_MANAGER_HOME_SOURCES]);
  if (contextResult.status !== "ok") return contextResult;

  const { manager, people, snapshot } = contextResult.context;

  if (classifyPersonnelType(manager.personnelType) !== "permanent") {
    return { status: "forbidden" };
  }

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

  const model = buildPermanentManagerHomeReadModel({
    person: manager,
    people,
    events,
    shiftSchedule,
    fetchedAt: snapshot.fetchedAt,
    now: getJerusalemLocalNow(),
  });

  return { status: "ok", model };
}
