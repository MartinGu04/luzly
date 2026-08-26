import type { RawCellValue, RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { EMERGENCY_ACTIVE_DESK_COLUMNS, EMERGENCY_SHEET_COLUMNS } from "@/lib/domain/emergencyDesks";
import type { EmergencyAssignment, EmergencyShiftPeriod } from "@/lib/domain/emergencyShift";
import { parseLocalDate } from "./date";
import { cellToTrimmedString, toA1Cell } from "./sheetGrid";

const PERIOD_LABELS: Record<string, EmergencyShiftPeriod> = {
  יום: "day",
  לילה: "night",
};

const HEADER_LABEL = "סוג משמרת";

export interface EmergencyParseDiagnostic {
  sourceCell: string;
  message: string;
}

export interface ParseEmergencyScheduleSheetResult {
  assignments: EmergencyAssignment[];
  diagnostics: EmergencyParseDiagnostic[];
}

/**
 * Parses the emergency workbook's "משמרות" sheet -- the RAW SOURCE OF
 * TRUTH for Emergency Mode desk staffing (spec section 6). Runtime
 * behavior NEVER depends on the derived "שבוע נוכחי" sheet's FILTER/
 * INDEX formulas -- this parser only ever reads "משמרות".
 *
 * Column layout is FIXED, not header-text-driven (unlike
 * `parseScheduleSheet`): A/B are legacy ("ס קרקעי"/"צ", deliberately
 * never read), C:L are the ten canonical active desk columns (see
 * `lib/domain/emergencyDesks.ts` for the exact mapping and why two of
 * them use a CURRENT name rather than their raw source header), M is
 * שift type (יום/לילה), N is day-of-week (read only to locate the
 * header row's neighborhood, never interpreted), O is the date --
 * populated only on the first row of each day; the night row's date
 * cell is blank and inherits the most recent valid date seen in this
 * same pass (forward-fill).
 *
 * Fails safely, never fabricates: a row whose period/date cannot be
 * determined is skipped (never assigned a guessed value) and recorded
 * as a diagnostic; a wholly blank row (no period, no date, no desk data)
 * is skipped silently as ordinary sheet padding, not a real anomaly. An
 * unresolved desk-cell name (no unique personnel match) still produces
 * an assignment -- `personId: null`, `personName` preserved raw -- it is
 * never silently dropped or misattributed to somebody else.
 */
export function parseEmergencyScheduleSheet(
  sheet: RawSheet,
  personnel: readonly Person[],
): ParseEmergencyScheduleSheetResult {
  const diagnostics: EmergencyParseDiagnostic[] = [];
  const assignments: EmergencyAssignment[] = [];

  const headerRowIndex = sheet.values.findIndex(
    (row) => cellToTrimmedString(row[EMERGENCY_SHEET_COLUMNS.shiftType]) === HEADER_LABEL,
  );
  if (headerRowIndex === -1) {
    diagnostics.push({
      sourceCell: toA1Cell(0, EMERGENCY_SHEET_COLUMNS.shiftType),
      message: `לא נמצאה שורת כותרת ("${HEADER_LABEL}" בעמודה M) בגיליון "${sheet.name}".`,
    });
    return { assignments, diagnostics };
  }

  const peopleByNormalizedName = buildNormalizedNameIndex(personnel);
  let lastKnownDate: string | null = null;

  for (let row = headerRowIndex + 1; row < sheet.values.length; row++) {
    const rowCells = sheet.values[row] ?? [];

    if (isRowEntirelyBlank(rowCells)) continue;

    const periodText = cellToTrimmedString(rowCells[EMERGENCY_SHEET_COLUMNS.shiftType]);
    const dateText = cellToTrimmedString(rowCells[EMERGENCY_SHEET_COLUMNS.dates]);

    const period = PERIOD_LABELS[periodText];
    if (!period) {
      diagnostics.push({
        sourceCell: toA1Cell(row, EMERGENCY_SHEET_COLUMNS.shiftType),
        message:
          periodText === ""
            ? `שורה ${row + 1}: חסר סוג משמרת (עמודה M) -- השורה דולגה.`
            : `שורה ${row + 1}: סוג משמרת לא מזוהה ("${periodText}") -- השורה דולגה.`,
      });
      continue;
    }

    let date: string;
    if (dateText !== "") {
      const parsed = parseLocalDate(dateText);
      if (!parsed) {
        diagnostics.push({
          sourceCell: toA1Cell(row, EMERGENCY_SHEET_COLUMNS.dates),
          message: `שורה ${row + 1}: תאריך לא תקין ("${dateText}") בעמודה O -- השורה דולגה.`,
        });
        continue;
      }
      date = parsed;
      lastKnownDate = parsed;
    } else if (lastKnownDate !== null) {
      date = lastKnownDate;
    } else {
      diagnostics.push({
        sourceCell: toA1Cell(row, EMERGENCY_SHEET_COLUMNS.dates),
        message: `שורה ${row + 1}: אין תאריך (עמודה O ריקה, ואין תאריך תקין קודם להמשך) -- השורה דולגה.`,
      });
      continue;
    }

    for (const { columnIndex, desk } of EMERGENCY_ACTIVE_DESK_COLUMNS) {
      const rawName = cellToTrimmedString(rowCells[columnIndex]);
      if (rawName === "") continue;

      assignments.push({
        date,
        period,
        desk,
        personId: resolvePersonId(rawName, peopleByNormalizedName),
        personName: rawName,
        sourceCell: toA1Cell(row, columnIndex),
      });
    }
  }

  return { assignments, diagnostics };
}

function isRowEntirelyBlank(rowCells: RawCellValue[]): boolean {
  if (cellToTrimmedString(rowCells[EMERGENCY_SHEET_COLUMNS.shiftType]) !== "") return false;
  if (cellToTrimmedString(rowCells[EMERGENCY_SHEET_COLUMNS.dates]) !== "") return false;
  return EMERGENCY_ACTIVE_DESK_COLUMNS.every(({ columnIndex }) => cellToTrimmedString(rowCells[columnIndex]) === "");
}

/** Every personnel record, grouped by normalized name -- same idiom as `shootingRanges.ts`'s `buildNormalizedNameIndex`. */
function buildNormalizedNameIndex(personnel: readonly Person[]): Map<string, Person[]> {
  const peopleByNormalizedName = new Map<string, Person[]>();
  for (const person of personnel) {
    const key = normalizeName(person.name);
    const group = peopleByNormalizedName.get(key);
    if (group) group.push(person);
    else peopleByNormalizedName.set(key, [person]);
  }
  return peopleByNormalizedName;
}

const BIDI_CONTROL_CHARS_RE = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;
const NBSP_RE = /\u00A0/g;

/** Same cross-sheet name normalization as `shootingRanges.ts`'s `normalizeName` (NFC + invisible bidi/formatting marks + NBSP + whitespace collapse) -- exact-match only, never fuzzy. */
function normalizeName(text: string): string {
  return text
    .normalize("NFC")
    .replace(BIDI_CONTROL_CHARS_RE, "")
    .replace(NBSP_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a desk cell's raw name text against personnel -- EXACTLY one
 * normalized match required. Zero or 2+ matches both fail closed to
 * `null` (spec section 8: "Do NOT add fuzzy matching that may silently
 * assign the wrong person"). The caller always keeps the raw name text
 * regardless, so an unresolved assignment stays visible, never dropped.
 */
function resolvePersonId(rawName: string, peopleByNormalizedName: ReadonlyMap<string, Person[]>): string | null {
  const matches = peopleByNormalizedName.get(normalizeName(rawName));
  return matches?.length === 1 ? matches[0].id : null;
}
