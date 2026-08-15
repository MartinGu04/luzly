import "server-only";
import { timedStage } from "@/lib/config/timingDiagnostics";
import { getGoogleSheetsContext } from "./client";
import {
  ALL_SHEET_SOURCE_KEYS,
  SHEET_SOURCES,
  toFullSheetA1Range,
  type SheetSourceKey,
} from "./sheetSources";
import type { RawCellValue, RawSheet, RawWorkbookSnapshot } from "./types";

/**
 * Fetches the raw values of the given logical sources (all of them by
 * default) in a single batchGet call. Never interprets the values — the
 * potential-duty sheets in particular are only ever returned raw here.
 *
 * This is the only place in the codebase allowed to call the Google Sheets
 * API, and it only ever reads (`spreadsheets.values.batchGet`). ALWAYS a
 * real network round trip -- see `lib/sync`'s cached wrapper for the
 * short-TTL reuse layer every read-model loader actually calls.
 */
export async function fetchRawWorkbookSnapshot(
  sourceKeys: SheetSourceKey[] = ALL_SHEET_SOURCE_KEYS,
): Promise<RawWorkbookSnapshot> {
  const { sheets, spreadsheetId } = getGoogleSheetsContext();

  const ranges = sourceKeys.map((key) => toFullSheetA1Range(SHEET_SOURCES[key]));

  const response = await timedStage(`google.batchGet(${sourceKeys.length} sources)`, () =>
    sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
      valueRenderOption: "FORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    }),
  );

  const valueRanges = response.data.valueRanges ?? [];

  const rawSheets: RawSheet[] = sourceKeys.map((key, index) => ({
    name: SHEET_SOURCES[key],
    values: (valueRanges[index]?.values ?? []) as RawCellValue[][],
  }));

  return {
    fetchedAt: new Date().toISOString(),
    sheets: rawSheets,
  };
}
