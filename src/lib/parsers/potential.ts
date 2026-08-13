import type { RawCellValue, RawSheet } from "@/lib/google";
import type { DutyFamily } from "@/lib/domain/event";
import type { PotentialAllocation } from "@/lib/domain/potentialAllocation";
import type { Person } from "@/lib/domain/types";
import { parseLocalDate } from "./date";
import { cellToString, cellToTrimmedString, gridWidth, toA1Cell } from "./sheetGrid";

/** Re-exported for convenience -- the type itself is domain-owned (see `lib/domain/potentialAllocation.ts`); this parser only produces values of that shape. */
export type { PotentialAllocation } from "@/lib/domain/potentialAllocation";

const DATE_HEADER_LABELS = ["תאריך"];
const DAY_HEADER_LABELS = ["יום"];

/**
 * Cell text used by the real workbook to mark a structurally
 * disabled/not-applicable Potential slot for that date (e.g. a guard slot
 * that doesn't run that day). Exact match only — never a requirement.
 */
const STRUCTURAL_PLACEHOLDER = "///////////////////";

/**
 * The verified, centralized requirement-column schema for BOTH real
 * Potential sheets (`פוטנציאל תקש"אס 1-6/2026` / `7-12/2026`, confirmed
 * identical row-1 operational header layout, columns A:T). The exact
 * Hebrew header text IS the structural schema — this is the only place
 * column identity is ever decided; never scattered `if (column === "L")`
 * logic in React. Any header not in this map (including `הערות`, and the
 * fairness/scoring side-table's headers, which live on a different row
 * further right) is never a requirement column and never produces a
 * `PotentialAllocation`.
 *
 * `slot` is the EXACT internal `Event.slot` to match — only guard/reserve
 * have a real numbered slot on the internal side (`event.ts`'s
 * `GUARD_RE`/`RESERVE_RE`). `sourceSlot` is the Potential column's own
 * numbering (e.g. "אוקסיד 2" → 2) — used only for deterministic
 * multiplicity-based pairing in `lib/domain/potentialReconciliation.ts`,
 * never matched against an internal slot (oxid/kitchen/rasar internal
 * Events don't carry one).
 */
interface RequirementColumnSchema {
  dutyFamily: DutyFamily;
  slot: number | null;
  sourceSlot: number | null;
}

const REQUIREMENT_COLUMNS: Readonly<Record<string, RequirementColumnSchema>> = {
  "שומר 1": { dutyFamily: "guard", slot: 1, sourceSlot: 1 },
  "שומר 2": { dutyFamily: "guard", slot: 2, sourceSlot: 2 },
  "שומר 3": { dutyFamily: "guard", slot: 3, sourceSlot: 3 },
  "שומר 4": { dutyFamily: "guard", slot: 4, sourceSlot: 4 },
  "עתודה 1": { dutyFamily: "reserve", slot: 1, sourceSlot: 1 },
  "עתודה 2": { dutyFamily: "reserve", slot: 2, sourceSlot: 2 },
  "אוקסיד 1": { dutyFamily: "oxid", slot: null, sourceSlot: 1 },
  "אוקסיד 2": { dutyFamily: "oxid", slot: null, sourceSlot: 2 },
  "אוקסיד 3": { dutyFamily: "oxid", slot: null, sourceSlot: 3 },
  "כונן פינויים": { dutyFamily: "evacuation_on_call", slot: null, sourceSlot: null },
  "מטבח יומי 1": { dutyFamily: "daily_kitchen", slot: null, sourceSlot: 1 },
  "מטבח יומי 2": { dutyFamily: "daily_kitchen", slot: null, sourceSlot: 2 },
  "מטבח מלא 1": { dutyFamily: "full_kitchen", slot: null, sourceSlot: 1 },
  "מטבח מלא 2": { dutyFamily: "full_kitchen", slot: null, sourceSlot: 2 },
  "מטבח מלא 3": { dutyFamily: "full_kitchen", slot: null, sourceSlot: 3 },
  'רס"ר 1': { dutyFamily: "rasar", slot: null, sourceSlot: 1 },
  'רס"ר 2': { dutyFamily: "rasar", slot: null, sourceSlot: 2 },
};

/**
 * Structurally parses one Potential sheet ("פוטנציאל תקש\"אס 1-6/2026" /
 * "פוטנציאל תקש\"אס 7-12/2026") into `PotentialAllocation[]`, using the
 * VERIFIED real schema (see `REQUIREMENT_COLUMNS`): a single operational
 * date/day block on row 1, columns A:T. The sheet's separate fairness/
 * scoring side-table lives on a LATER row, further right (title around
 * column W, headers around W:AB) — it is structurally excluded simply by
 * never matching `REQUIREMENT_COLUMNS` (its headers aren't in the map)
 * AND by never sharing a row with a parseable operational date (every
 * data row here requires `rowCells[dateCol]` to parse as a date; a
 * fairness title/header/score row won't). `הערות` and any other
 * unrecognized header are never treated as a requirement. Blank cells and
 * the exact `///////////////////` structural placeholder are both
 * skipped — neither produces a `PotentialAllocation`.
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

  const columns: { col: number; label: string; schema: RequirementColumnSchema }[] = [];
  for (let col = allocationZoneStart; col < width; col++) {
    const label = cellToTrimmedString(headerRow[col]);
    const schema = REQUIREMENT_COLUMNS[label];
    if (!schema) continue; // not a recognized requirement column (הערות, fairness headers, unknown text) -- never guessed.
    columns.push({ col, label, schema });
  }
  if (columns.length === 0) return [];

  const personByNormalizedName = new Map<string, Person>();
  for (const person of personnel) {
    personByNormalizedName.set(normalizeAllocationText(person.name), person);
  }

  const allocations: PotentialAllocation[] = [];

  for (let row = headerRowIndex + 1; row < sheet.values.length; row++) {
    const rowCells = sheet.values[row] ?? [];
    const date = parseLocalDate(cellToTrimmedString(rowCells[dateCol]));
    if (!date) continue; // malformed/blank date row (also structurally protects against the fairness section below) -- skipped, never guessed.

    for (const { col, label, schema } of columns) {
      const rawValue = cellToString(rowCells[col]);
      const trimmed = rawValue.trim();
      if (trimmed === "" || trimmed === STRUCTURAL_PLACEHOLDER) continue;

      const resolvedPerson = personByNormalizedName.get(normalizeAllocationText(rawValue));

      allocations.push({
        date,
        dutyFamily: schema.dutyFamily,
        slot: schema.slot,
        sourceSlot: schema.sourceSlot,
        columnLabel: label,
        sourceAllocationLabel: rawValue,
        resolvedSourcePersonId: resolvedPerson?.id ?? null,
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
 * is used here — the verified real workbook has a single operational
 * block, not multiple side-by-side blocks like "משמרות + תורנויות".
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

function normalizeAllocationText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
