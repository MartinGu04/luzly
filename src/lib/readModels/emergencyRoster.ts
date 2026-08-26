import "server-only";
import { GoogleConfigError } from "@/lib/google";
import { EMERGENCY_SHEET_SOURCES } from "@/lib/google/emergencySheetSources";
import { getEmergencyWorkbookSnapshot } from "@/lib/sync";
import { parseEmergencyScheduleSheet, type EmergencyParseDiagnostic } from "@/lib/parsers/emergencySchedule";
import type { EmergencyAssignment } from "@/lib/domain/emergencyShift";
import type { Person } from "@/lib/domain/types";

export type EmergencyRosterResult =
  | { status: "ok"; assignments: EmergencyAssignment[]; diagnostics: EmergencyParseDiagnostic[]; fetchedAt: string }
  | { status: "configuration_error"; message: string };

/**
 * The ONE place that fetches + parses the emergency workbook's "משמרות"
 * sheet into resolved `EmergencyAssignment`s. Every emergency-aware read
 * model goes through this (directly, or via `resolveOperationalRoster`
 * in `operationalMode.ts`) rather than re-implementing the Google fetch
 * + parse sequence itself.
 *
 * Fails closed to `"configuration_error"` on ANY problem reaching or
 * reading the emergency workbook (missing env config, a broken Google
 * request, a missing sheet) -- callers (see `operationalMode.ts`) must
 * render a visible unavailable state, never silently fall back to
 * regular shift assignments while Emergency Mode is active (spec
 * section 4/29).
 */
export async function loadEmergencyRoster(personnel: readonly Person[]): Promise<EmergencyRosterResult> {
  let snapshot;
  try {
    snapshot = await getEmergencyWorkbookSnapshot(["shifts"]);
  } catch (error) {
    if (error instanceof GoogleConfigError) {
      return { status: "configuration_error", message: error.message };
    }
    throw error;
  }

  const sheet = snapshot.sheets.find((candidate) => candidate.name === EMERGENCY_SHEET_SOURCES.shifts);
  if (!sheet) {
    return {
      status: "configuration_error",
      message: `Emergency workbook snapshot is missing the "${EMERGENCY_SHEET_SOURCES.shifts}" sheet.`,
    };
  }

  const { assignments, diagnostics } = parseEmergencyScheduleSheet(sheet, personnel);
  return { status: "ok", assignments, diagnostics, fetchedAt: snapshot.fetchedAt };
}
