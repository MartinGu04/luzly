import type { RawCellValue } from "@/lib/google";

/** Converts a raw cell value to a plain string, treating null/undefined as "". */
export function cellToString(value: RawCellValue | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Trimmed string form of a cell — use for header/label matching, never for stored rawValue. */
export function cellToTrimmedString(value: RawCellValue | undefined): string {
  return cellToString(value).trim();
}

export function isBlankCell(value: RawCellValue | undefined): boolean {
  return cellToTrimmedString(value) === "";
}

/**
 * Google checkbox cells may arrive as real booleans or as "TRUE"/"FALSE"
 * (any case) formatted strings. Anything else normalizes to false.
 */
export function cellToBoolean(value: RawCellValue | undefined): boolean {
  if (typeof value === "boolean") return value;
  return cellToTrimmedString(value).toUpperCase() === "TRUE";
}

/** Finds the first row index (within the grid) where some cell's trimmed text matches. */
export function findRowIndexByCellText(
  values: RawCellValue[][],
  matches: (cellText: string) => boolean,
  searchLimit = values.length,
): number {
  const limit = Math.min(searchLimit, values.length);
  for (let row = 0; row < limit; row++) {
    const cells = values[row] ?? [];
    if (cells.some((cell) => matches(cellToTrimmedString(cell)))) {
      return row;
    }
  }
  return -1;
}

/** Finds the column index within a header row whose trimmed text matches one of the labels. */
export function findColumnIndexByHeader(
  headerRow: RawCellValue[],
  labels: readonly string[],
): number {
  return headerRow.findIndex((cell) => labels.includes(cellToTrimmedString(cell)));
}

/** Widest row length across the whole grid — safer than trusting the header row alone. */
export function gridWidth(values: RawCellValue[][]): number {
  return values.reduce((max, row) => Math.max(max, row.length), 0);
}

const COLUMN_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 0-indexed column number -> spreadsheet column letters (0 -> "A", 26 -> "AA"). */
export function columnIndexToLetters(index: number): string {
  let n = index;
  let letters = "";
  do {
    letters = COLUMN_LETTERS[n % 26] + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

/** 0-indexed row/column -> A1 cell reference (0,0 -> "A1"). */
export function toA1Cell(rowIndex: number, columnIndex: number): string {
  return `${columnIndexToLetters(columnIndex)}${rowIndex + 1}`;
}
