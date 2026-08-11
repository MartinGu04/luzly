/**
 * One non-empty person/date cell from the schedule sheet, structurally
 * extracted but not yet semantically classified (shift vs. duty vs. leave,
 * etc. — that comes later). `rawValue` is preserved exactly as the cell
 * contained it.
 */
export interface RawAssignment {
  personId: string;
  personName: string;
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  rawValue: string;
  sourceSheet: string;
  sourceCell: string;
}
