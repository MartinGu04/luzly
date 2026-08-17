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

/**
 * The calendar year a "...1-6/YYYY" / "...7-12/YYYY" Potential/Fairness
 * source tab name represents -- structurally parsed from the tab name's own
 * trailing "/YYYY", NEVER a hardcoded year anywhere in this codebase
 * (`SHEET_SOURCES.potentialH1`/`potentialH2` above are the one place that
 * year is written down at all). The real workbook tab name IS the source
 * of truth for which year's data a fetched sheet actually holds -- when a
 * `SHEET_SOURCES` name doesn't end in a 4-digit year (a future/renamed/
 * misconfigured tab), this returns `null` rather than guessing one.
 */
export function parseSourcePeriodYear(sheetName: string): number | null {
  const match = /\/(\d{4})$/.exec(sheetName.trim());
  return match ? Number(match[1]) : null;
}
