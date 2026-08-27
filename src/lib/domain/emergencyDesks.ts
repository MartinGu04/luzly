/**
 * Centralized, typed config for the emergency workbook's ("משמרות
 * המהפכה עם טבלת צדק") active desk columns -- the ONE place the C:L
 * column -> canonical desk name mapping is written down. Both the
 * parser (`lib/parsers/emergencySchedule.ts`) and any presentation code
 * that needs "every known desk name" import from here, never redefine
 * their own copy.
 *
 * IMPORTANT, per the workbook's own history (do not "fix" these back to
 * the raw source header text):
 *   - Column I's raw source header currently reads "מפקד כטמ\"מ", but the
 *     workbook's own derived "שבוע נוכחי" sheet calls it "ס' אווירי א'".
 *     This app uses the CURRENT/derived name, "ס' אווירי א'".
 *   - Column L's raw source header currently reads "מפקד מכלול", but the
 *     derived sheet calls it "מפקד דסק". This app uses "מפקד דסק".
 * Columns A ("ס קרקעי") and B ("צ") are LEGACY and are deliberately
 * excluded from this map -- they must never automatically become
 * current emergency desks merely because they sit before "סוג משמרת".
 */
export interface EmergencyDeskColumn {
  /** 0-indexed column position within the "משמרות" sheet's row arrays (C = 2). */
  columnIndex: number;
  /** The canonical, CURRENT desk name -- never the raw/legacy source header text. */
  desk: string;
}

export const EMERGENCY_ACTIVE_DESK_COLUMNS: readonly EmergencyDeskColumn[] = [
  { columnIndex: 2, desk: "הוגוורט" }, // C
  { columnIndex: 3, desk: "פ'" }, // D
  { columnIndex: 4, desk: "ק'" }, // E
  { columnIndex: 5, desk: "הנחשונים" }, // F
  { columnIndex: 6, desk: "כחולה" }, // G
  { columnIndex: 7, desk: "ס' אוורי ב'" }, // H
  { columnIndex: 8, desk: "ס' אווירי א'" }, // I -- current name, not raw header "מפקד כטמ״מ"
  { columnIndex: 9, desk: "תיעוד" }, // J
  { columnIndex: 10, desk: "משה דץ הצדיק" }, // K
  { columnIndex: 11, desk: "מפקד דסק" }, // L -- current name, not raw header "מפקד מכלול"
];

/** Every canonical current desk name, in column order. */
export const EMERGENCY_DESK_NAMES: readonly string[] = EMERGENCY_ACTIVE_DESK_COLUMNS.map((c) => c.desk);

/** The "משמרות" sheet's other fixed columns, per the canonical layout (spec section 6). */
export const EMERGENCY_SHEET_COLUMNS = {
  /** M -- סוג משמרת (יום/לילה). */
  shiftType: 12,
  /** N -- יום בשבוע. */
  dayOfWeek: 13,
  /** O -- תאריכים. Populated only on the first row of each day; the night row inherits it. */
  dates: 14,
} as const;
