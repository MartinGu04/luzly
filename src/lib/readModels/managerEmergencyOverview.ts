import "server-only";
import { SHEET_SOURCES, type RawWorkbookSnapshot } from "@/lib/google";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getWorkbookSnapshot } from "@/lib/sync";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { buildEmergencyScheduleReadModel, type EmergencyScheduleManagerIdentity } from "./buildEmergencyScheduleReadModel";
import { resolveEmergencyManagerOverview, type EmergencyManagerOperationalOverview } from "./buildEmergencyManagerOverview";
import { resolveOperationalRoster } from "./operationalMode";
import type { EmergencyScheduleReadModel } from "./emergencyScheduleTypes";

export type ManagerEmergencyOverviewResult =
  | { status: "emergency_unavailable"; message: string }
  | {
      status: "ok";
      model: EmergencyScheduleReadModel;
      /**
       * "משמרת קודמת | משמרת נוכחית | משמרת הבאה" -- set exactly when
       * `model.perspective === "all"` (the Manager Area's own default
       * operational view), `null` for a "person" perspective (which shows
       * that colleague's personal schedule instead, never this triad).
       */
      operationalOverview: EmergencyManagerOperationalOverview | null;
    };

/** Looks the personnel sheet up by its logical source name -- the personnel-only fetch this loader needs, same convention as `schedule.ts`'s own `getPersonnelSheet` helper. */
function getPersonnelSheet(snapshot: RawWorkbookSnapshot) {
  const sheet = snapshot.sheets.find((candidate) => candidate.name === SHEET_SOURCES.personnel);
  if (!sheet) throw new Error(`Workbook snapshot is missing the "${SHEET_SOURCES.personnel}" sheet.`);
  return sheet;
}

/** Same convention as `getPersonnelSheet` above, for the regular workbook's own shift-time configuration -- see `resolveEmergencyManagerOverview`'s own docs for why the operational overview needs it. */
function getSettingsSheet(snapshot: RawWorkbookSnapshot) {
  const sheet = snapshot.sheets.find((candidate) => candidate.name === SHEET_SOURCES.settings);
  if (!sheet) throw new Error(`Workbook snapshot is missing the "${SHEET_SOURCES.settings}" sheet.`);
  return sheet;
}

/**
 * Manager Area's Emergency Mode branch (spec section 13) -- by the time
 * this is called, `ManagerPage` has ALREADY re-verified manager status via
 * `getRequestManagerOverview`, so `manager` here is trusted. Mirrors
 * `/schedule`'s own emergency loader (`schedule.ts`'s private
 * `loadEmergencyScheduleReadModel`) exactly: an independent personnel-only
 * re-fetch, then `resolveOperationalRoster` for the desk assignments, then
 * pure construction via `buildEmergencyScheduleReadModel` -- never the
 * regular coverage/duties/potential read models, which stay entirely
 * unused while Emergency Mode is active. `requestedPersonId` defaults to
 * `"all"` (unlike `/schedule`'s own default of "self") -- Manager Area's
 * overview is the whole-roster desk staffing view by default, only
 * narrowing to one person's own assignments when the manager has actually
 * selected someone (the SAME `?person=` selection `ManagerOverviewReadModel`
 * already resolved for the regular-mode branch).
 *
 * Also fetches the regular workbook's "settings" source (same convention
 * as `personalSchedule.ts`'s own best-effort `ShiftSchedule` construction)
 * to resolve `operationalOverview` -- the "all" perspective's own
 * previous/current/next triad (`resolveEmergencyManagerOverview`), so the
 * Manager Area's default view is operational/immediate rather than a
 * chronological dump of every recorded shift. A broken shift-time
 * configuration degrades gracefully (see that function's own docs), never
 * blocking the rest of this Emergency Mode branch.
 */
export async function loadManagerEmergencyOverview(
  manager: EmergencyScheduleManagerIdentity,
  requestedPersonId: string | null,
): Promise<ManagerEmergencyOverviewResult> {
  const snapshot = await getWorkbookSnapshot(["personnel", "settings"]);
  const people = parsePersonnelSheet(getPersonnelSheet(snapshot));
  const settings = parseSettingsSheet(getSettingsSheet(snapshot));

  let bestEffortShiftSchedule: ShiftSchedule | null = null;
  try {
    bestEffortShiftSchedule = buildShiftSchedule(settings.shiftStartTimeDay);
  } catch (error) {
    if (!(error instanceof ShiftConfigurationError)) throw error;
  }

  const roster = await resolveOperationalRoster(people);
  if (roster.mode === "regular") {
    // Structurally unreachable within one request: `resolveOperationalMode`
    // is request-scoped `cache()`-memoized, so it cannot report "regular"
    // here immediately after the caller already observed "emergency"
    // moments earlier in the SAME request (see `operationalMode.ts`'s own
    // docs, and `schedule.ts`'s identical guard).
    throw new Error("resolveOperationalRoster reported 'regular' inconsistently within the same request.");
  }
  if (roster.mode === "emergency_unavailable") {
    return { status: "emergency_unavailable", message: roster.message };
  }

  const now = getJerusalemLocalNow();

  const model = buildEmergencyScheduleReadModel({
    manager,
    people,
    assignments: roster.assignments,
    period: roster.period,
    fetchedAt: roster.fetchedAt,
    now,
    diagnostics: roster.diagnostics,
    selfPersonId: manager.id,
    selfPersonName: manager.name,
    requestedPersonId: requestedPersonId ?? "all",
  });

  const operationalOverview =
    model.perspective === "all" ? resolveEmergencyManagerOverview(roster.assignments, now, bestEffortShiftSchedule) : null;

  return { status: "ok", model, operationalOverview };
}
