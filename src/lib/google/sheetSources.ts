/** Logical sources this app can request, mapped to their real sheet-tab names. */
export const SHEET_SOURCES = {
  settings: "הגדרות",
  personnel: 'כ"א',
  schedule: "משמרות + תורנויות",
  potentialH1: 'פוטנציאל תקש"אס 1-6/2026',
  potentialH2: 'פוטנציאל תקש"אס 7-12/2026',
} as const;

export type SheetSourceKey = keyof typeof SHEET_SOURCES;

export const ALL_SHEET_SOURCE_KEYS = Object.keys(
  SHEET_SOURCES,
) as SheetSourceKey[];

/**
 * Wraps a sheet name as an A1 range covering the whole tab, escaping single
 * quotes per Sheets A1 notation so names with spaces/quotes/slashes are safe.
 */
export function toFullSheetA1Range(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}
