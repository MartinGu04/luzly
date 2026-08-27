import "server-only";
import { GoogleConfigError } from "@/lib/google";
import { EMERGENCY_SHEET_SOURCES } from "@/lib/google/emergencySheetSources";
import { getEmergencyWorkbookSnapshot } from "@/lib/sync";
import { parseEmergencyScheduleSheet } from "@/lib/parsers/emergencySchedule";
import { parseEmergencyFairnessGroups } from "@/lib/parsers/emergencyFairnessGroups";
import { getActiveEmergencyModePeriod } from "@/lib/emergencyMode/store";
import { buildEmergencyFairnessReadModel } from "./buildEmergencyFairnessReadModel";
import { getFairnessWorkbookSheet, loadFairnessWorkbookContext } from "./fairnessWorkbookContext";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import type { EmergencyFairnessReadModel } from "./emergencyFairnessTypes";

export type EmergencyFairnessLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  /** The emergency workbook itself is not configured/readable -- distinct from an auth failure. The page hides/soft-disables this mode rather than treating it as a hard error, since a deployment that has never touched Emergency Mode should never be blocked here. */
  | { status: "unavailable" }
  | { status: "ok"; model: EmergencyFairnessReadModel };

/**
 * Emergency shift fairness (spec section 16/17) is available independent
 * of whether Emergency Mode is CURRENTLY active -- it reflects the full
 * recorded history in the emergency workbook's own "משמרות" sheet, so a
 * past, already-deactivated emergency's fairness data remains visible
 * (Google Sheets data is never deleted/mutated by deactivating Emergency
 * Mode). `activePeriod` on the result is display-only context.
 *
 * Reuses `loadFairnessWorkbookContext()` for identity/personnel (the
 * SAME non-manager-only boundary the regular Shift/Duty Fairness modes
 * use) -- personnel identity always comes from the regular workbook,
 * per spec section 4.
 */
export async function loadEmergencyFairnessReadModel(): Promise<EmergencyFairnessLoadResult> {
  const context = await loadFairnessWorkbookContext();
  if (context.status !== "ok") {
    return { status: context.status };
  }

  const people = parsePersonnelSheet(getFairnessWorkbookSheet(context.context.snapshot, "personnel"));

  let emergencySnapshot;
  try {
    emergencySnapshot = await getEmergencyWorkbookSnapshot(["shifts", "fairnessGroups"]);
  } catch (error) {
    if (error instanceof GoogleConfigError) return { status: "unavailable" };
    throw error;
  }

  const shiftsSheet = emergencySnapshot.sheets.find((sheet) => sheet.name === EMERGENCY_SHEET_SOURCES.shifts);
  const fairnessGroupsSheet = emergencySnapshot.sheets.find(
    (sheet) => sheet.name === EMERGENCY_SHEET_SOURCES.fairnessGroups,
  );
  if (!shiftsSheet) return { status: "unavailable" };

  const { assignments } = parseEmergencyScheduleSheet(shiftsSheet, people);
  const groupMembership = fairnessGroupsSheet
    ? parseEmergencyFairnessGroups(fairnessGroupsSheet)
    : parseEmergencyFairnessGroups({ name: EMERGENCY_SHEET_SOURCES.fairnessGroups, values: [] });

  const activePeriod = await getActiveEmergencyModePeriod();

  const model = buildEmergencyFairnessReadModel({
    activePeriod,
    assignments,
    people,
    groupMembership,
    fetchedAt: emergencySnapshot.fetchedAt,
  });

  return { status: "ok", model };
}
