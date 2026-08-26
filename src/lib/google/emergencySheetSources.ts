/**
 * Logical sources within the EMERGENCY workbook ("משמרות המהפכה עם טבלת
 * צדק"), mapped to their real sheet-tab names -- the emergency-workbook
 * sibling of `SHEET_SOURCES`/`SheetSourceKey` (`sheetSources.ts`).
 * Deliberately its OWN separate map/type rather than widening the
 * regular one -- `SheetSourceKey` has no workbook-identity dimension
 * today, and folding a second workbook's sheet names into it would risk
 * an emergency source key silently resolving against the regular
 * spreadsheet (or vice versa) at some future cache/fetch call site. See
 * `emergencyWorkbookSnapshotCache.ts` for why the cache layer ALSO stays
 * a fully separate module rather than widening the regular one.
 */
export const EMERGENCY_SHEET_SOURCES = {
  /** The raw source of truth -- desk assignment columns C:L, see `lib/parsers/emergencySchedule.ts`. Runtime behavior must never depend on the OTHER two sheets' derived formulas. */
  shifts: "משמרות",
  /** A derived display/helper sheet (FILTER/INDEX formulas) -- never a runtime data source, per CLAUDE.md/spec section 6. */
  currentWeek: "שבוע נוכחי",
  /** Group-membership source for emergency fairness presentation ONLY (spec section 17) -- its numeric totals are never trusted, always recomputed from `shifts`. */
  fairnessGroups: "גזירת נתונים",
} as const;

export type EmergencySheetSourceKey = keyof typeof EMERGENCY_SHEET_SOURCES;

export const ALL_EMERGENCY_SHEET_SOURCE_KEYS = Object.keys(
  EMERGENCY_SHEET_SOURCES,
) as EmergencySheetSourceKey[];
