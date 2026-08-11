/** A single spreadsheet cell as returned by the Sheets API (formatted-value rendering). */
export type RawCellValue = string | number | boolean | null;

/** One worksheet's raw grid, exactly as fetched — no interpretation applied. */
export interface RawSheet {
  name: string;
  values: RawCellValue[][];
}

/** A single fetch of the configured logical sources from the workbook. */
export interface RawWorkbookSnapshot {
  fetchedAt: string;
  sheets: RawSheet[];
}
