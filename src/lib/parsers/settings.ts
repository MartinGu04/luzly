import type { RawSheet } from "@/lib/google";
import { cellToTrimmedString, findColumnIndexByHeader } from "./sheetGrid";

export interface WorkbookSettings {
  /** Raw value of "תחילת משמרת יום", exactly as entered in the sheet. */
  shiftStartTimeDay: string | null;
  /** Every setting label -> value pair found, for settings not yet modeled explicitly. */
  raw: Record<string, string>;
}

const SETTING_LABEL_HEADER = "הגדרה";
const SETTING_VALUE_HEADER = "ערך";
const SHIFT_START_TIME_DAY_LABEL = "תחילת משמרת יום";

const EMPTY_SETTINGS: WorkbookSettings = { shiftStartTimeDay: null, raw: {} };

/**
 * The settings sheet's "הגדרה"/"ערך" columns can move, so this locates them
 * by header text on whichever row contains both, rather than assuming A/B.
 */
export function parseSettingsSheet(sheet: RawSheet): WorkbookSettings {
  const headerRowIndex = sheet.values.findIndex((row) => {
    const labelCol = findColumnIndexByHeader(row, [SETTING_LABEL_HEADER]);
    const valueCol = findColumnIndexByHeader(row, [SETTING_VALUE_HEADER]);
    return labelCol !== -1 && valueCol !== -1;
  });

  if (headerRowIndex === -1) return EMPTY_SETTINGS;

  const headerRow = sheet.values[headerRowIndex] ?? [];
  const labelCol = findColumnIndexByHeader(headerRow, [SETTING_LABEL_HEADER]);
  const valueCol = findColumnIndexByHeader(headerRow, [SETTING_VALUE_HEADER]);

  const raw: Record<string, string> = {};
  for (let row = headerRowIndex + 1; row < sheet.values.length; row++) {
    const cells = sheet.values[row] ?? [];
    const label = cellToTrimmedString(cells[labelCol]);
    if (!label) continue;
    raw[label] = cellToTrimmedString(cells[valueCol]);
  }

  return {
    shiftStartTimeDay: raw[SHIFT_START_TIME_DAY_LABEL] ?? null,
    raw,
  };
}
