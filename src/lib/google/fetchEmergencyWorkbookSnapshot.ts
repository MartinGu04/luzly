import "server-only";
import { timedStage } from "@/lib/config/timingDiagnostics";
import { getGoogleEmergencySheetsContext } from "./emergencyClient";
import { toFullSheetA1Range } from "./sheetSources";
import {
  ALL_EMERGENCY_SHEET_SOURCE_KEYS,
  EMERGENCY_SHEET_SOURCES,
  type EmergencySheetSourceKey,
} from "./emergencySheetSources";
import type { RawCellValue, RawSheet, RawWorkbookSnapshot } from "./types";

/**
 * Fetches the raw values of the given EMERGENCY workbook sources (all of
 * them by default) in a single batchGet call -- the emergency-workbook
 * sibling of `fetchRawWorkbookSnapshot()`. Never interprets the values.
 *
 * This is the only place in the codebase allowed to call the Google
 * Sheets API against the emergency spreadsheet, and it only ever reads.
 * Callers decide caching (see `emergencyWorkbookSnapshotCache.ts` for
 * the short-TTL interactive reuse layer, and the notification worker's
 * own genuinely-uncached fresh-read path, mirroring the regular
 * workbook's same split).
 */
export async function fetchRawEmergencyWorkbookSnapshot(
  sourceKeys: EmergencySheetSourceKey[] = ALL_EMERGENCY_SHEET_SOURCE_KEYS,
): Promise<RawWorkbookSnapshot> {
  const { sheets, spreadsheetId } = getGoogleEmergencySheetsContext();

  const ranges = sourceKeys.map((key) => toFullSheetA1Range(EMERGENCY_SHEET_SOURCES[key]));

  const response = await timedStage(`google.emergency.batchGet(${sourceKeys.length} sources)`, () =>
    sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
      valueRenderOption: "FORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    }),
  );

  const valueRanges = response.data.valueRanges ?? [];

  const rawSheets: RawSheet[] = sourceKeys.map((key, index) => ({
    name: EMERGENCY_SHEET_SOURCES[key],
    values: (valueRanges[index]?.values ?? []) as RawCellValue[][],
  }));

  return {
    fetchedAt: new Date().toISOString(),
    sheets: rawSheets,
  };
}
