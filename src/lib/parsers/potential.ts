import type { RawCellValue, RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parseLocalDate } from "./date";
import { cellToString, cellToTrimmedString, gridWidth, toA1Cell } from "./sheetGrid";

const DATE_HEADER_LABELS = ["תאריך"];
const DAY_HEADER_LABELS = ["יום"];

/**
 * The Potential sheet's own separate fairness/scoring side-table (see
 * `lib/domain/README.md` and PR #14's discovery notes) — a completely
 * different concept from the operational allocation table this parser
 * reads. The first header cell (left-to-right within the identified
 * header row) matching any of these labels marks where the operational
 * table ends; that column and everything after it is never read as an
 * allocation column. `סופ"שים`/`פטורים` in particular are fairness-only
 * concepts and must never be mistaken for a requirement column.
 */
const FAIRNESS_TABLE_HEADER_LABELS = new Set([
  "שם",
  "הקצאה",
  "ניקוד הפוטנציאל הקודם",
  "ניקוד לפוטנציאל הנוכחי",
  'סופ"שים',
  "פטורים",
]);

/**
 * One non-empty allocation cell from the Potential sheet's operational
 * table: a source/framework requirement for `date`, under whichever
 * column (`columnLabel`, the column's own header text) it was found in.
 *
 * `resolvedPersonId` is set ONLY when `rawValue` (whitespace-normalized)
 * exactly equals a known `Person.name` — never a fuzzy/partial match.
 * Null means the cell is an organizational/source allocation label, e.g.
 * a role or unit name that isn't a specific known person; `rawValue` is
 * always preserved honestly either way, never discarded or reinterpreted.
 *
 * Deliberately NOT an `Event` — Potential is the source/framework
 * allocation, never the internal actual schedule (see PR #14 /
 * `lib/domain/README.md`'s Potential-vs-internal note). Reconciliation
 * against internal `Event[]` happens in `lib/domain/potentialReconciliation.ts`,
 * never here.
 */
export interface PotentialAllocation {
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  /** The requirement column's own header text, verbatim (trimmed) — the only stable identity a column has; see the parser-level doc comment for why this is never mapped to an invented duty/requirement enum. */
  columnLabel: string;
  rawValue: string;
  resolvedPersonId: string | null;
  sourceSheet: string;
  sourceCell: string;
}

/**
 * Structurally parses one Potential sheet ("פוטנציאל תקש\"אס 1-6/2026" /
 * "פוטנציאל תקש\"אס 7-12/2026") into `PotentialAllocation[]`.
 *
 * KNOWN STRUCTURAL ASSUMPTIONS (from the product-supplied discovery notes,
 * not a live inspection of the real workbook — see PR #14's report):
 * - the operational allocation table is a single date/day block on the
 *   left side of the sheet, in the same date+day+columns shape as
 *   "משמרות + תורנויות"'s blocks (`schedule.ts`) — NOT multiple
 *   side-by-side blocks like that sheet. If the real workbook turns out
 *   to have more than one Potential block, this needs revisiting.
 * - a fairness/scoring side-table shares the SAME header row, to the
 *   right of the operational table (see `FAIRNESS_TABLE_HEADER_LABELS`).
 * - every requirement/allocation column has non-blank header text acting
 *   as its stable identity (`columnLabel`). A column with a blank header
 *   is skipped — there's no stable identity to attach its cells to. This
 *   also means no invented duty/requirement-family mapping is applied to
 *   any column (see the module doc comment and PR #14's report for the
 *   explicit "not enough structure to type this yet" call-out) — a
 *   future PR can add one once the real header labels are confirmed.
 *
 * Deliberately conservative: never iterates "every non-empty cell", never
 * fuzzy-matches text against personnel, and structurally excludes the
 * fairness/scoring area rather than trying to interpret it.
 */
export function parsePotentialSheet(sheet: RawSheet, personnel: readonly Person[]): PotentialAllocation[] {
  const headerRowIndex = sheet.values.findIndex((row) =>
    row.some((cell) => {
      const text = cellToTrimmedString(cell);
      return DATE_HEADER_LABELS.includes(text) || DAY_HEADER_LABELS.includes(text);
    }),
  );
  if (headerRowIndex === -1) return [];

  const headerRow = sheet.values[headerRowIndex] ?? [];
  const dateCol = findPotentialDateColumn(sheet.values, headerRowIndex, headerRow);
  if (dateCol === -1) return [];

  const hasDayCol = DAY_HEADER_LABELS.includes(cellToTrimmedString(headerRow[dateCol + 1]));
  const allocationZoneStart = dateCol + (hasDayCol ? 2 : 1);

  const width = Math.max(gridWidth(sheet.values), headerRow.length);
  const allocationZoneEnd = findFairnessTableBoundary(headerRow, allocationZoneStart, width);

  const personByNormalizedName = new Map<string, Person>();
  for (const person of personnel) {
    personByNormalizedName.set(normalizeAllocationText(person.name), person);
  }

  const columns: { col: number; label: string }[] = [];
  for (let col = allocationZoneStart; col < allocationZoneEnd; col++) {
    const label = cellToTrimmedString(headerRow[col]);
    if (label === "") continue; // no stable identity for this column -- never guessed.
    columns.push({ col, label });
  }
  if (columns.length === 0) return [];

  const allocations: PotentialAllocation[] = [];

  for (let row = headerRowIndex + 1; row < sheet.values.length; row++) {
    const rowCells = sheet.values[row] ?? [];
    const date = parseLocalDate(cellToTrimmedString(rowCells[dateCol]));
    if (!date) continue; // malformed/blank date row -- skipped, never guessed.

    for (const { col, label } of columns) {
      const rawValue = cellToString(rowCells[col]);
      if (rawValue.trim() === "") continue;

      const resolvedPerson = personByNormalizedName.get(normalizeAllocationText(rawValue));

      allocations.push({
        date,
        columnLabel: label,
        rawValue,
        resolvedPersonId: resolvedPerson?.id ?? null,
        sourceSheet: sheet.name,
        sourceCell: toA1Cell(row, col),
      });
    }
  }

  return allocations;
}

/**
 * Same anchoring strategy as `schedule.ts`'s date-column detection: some
 * sheets label the date column "תאריך" outright; when they don't, the
 * reliably-labeled "יום" column right after it is used to infer it (the
 * candidate one column to its left, accepted if it says "תאריך" too, or
 * the rows below it actually parse as dates). Only the first such column
 * is used here — Potential is assumed to be a single block (see the
 * module doc comment).
 */
function findPotentialDateColumn(
  values: RawCellValue[][],
  headerRowIndex: number,
  headerRow: RawCellValue[],
): number {
  for (let col = 0; col < headerRow.length; col++) {
    if (DATE_HEADER_LABELS.includes(cellToTrimmedString(headerRow[col]))) return col;
  }

  for (let col = 0; col < headerRow.length; col++) {
    if (!DAY_HEADER_LABELS.includes(cellToTrimmedString(headerRow[col]))) continue;

    const candidateDateCol = col - 1;
    if (candidateDateCol < 0) continue;

    if (columnHasParseableDate(values, headerRowIndex, candidateDateCol)) {
      return candidateDateCol;
    }
  }

  return -1;
}

function columnHasParseableDate(values: RawCellValue[][], headerRowIndex: number, col: number): boolean {
  for (let row = headerRowIndex + 1; row < values.length; row++) {
    const text = cellToTrimmedString(values[row]?.[col]);
    if (text !== "" && parseLocalDate(text) !== null) return true;
  }
  return false;
}

/** The first fairness-table header column at or after `from`, or `end` (the sheet's own width) when none is found. */
function findFairnessTableBoundary(headerRow: RawCellValue[], from: number, end: number): number {
  for (let col = from; col < end; col++) {
    if (FAIRNESS_TABLE_HEADER_LABELS.has(cellToTrimmedString(headerRow[col]))) return col;
  }
  return end;
}

function normalizeAllocationText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
