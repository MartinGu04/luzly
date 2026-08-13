import type { RawCellValue, RawSheet } from "@/lib/google";
import type {
  FairnessPersonRow,
  FairnessTableParseResult,
  FairnessTargets,
} from "@/lib/domain/fairnessTable";
import type { Person } from "@/lib/domain/types";
import { cellToString, cellToTrimmedString, gridWidth, toA1Cell } from "./sheetGrid";

/**
 * The verified, EXACT six-header schema of the Fairness table side-table
 * that lives on both real Potential sheets, further right than the
 * operational block and on a later row (PR #15 §6). This — not a fixed
 * column range like W:AB — is the ONLY thing that locates the table: the
 * current workbook happens to place it around W:AB, but a future reflow
 * that moves it elsewhere still parses correctly as long as these six
 * labels appear together, in order, on one row.
 */
const FAIRNESS_HEADER_LABELS = [
  "שם",
  "הקצאה",
  "ניקוד הפוטנציאל הקודם",
  "ניקוד לפוטנציאל הנוכחי",
  'סופ"שים',
  "פטורים",
] as const;

/** Exact prefix match (the sheet's own cell is "סך הכל:") -- stops person-row parsing and starts the totals row. */
const TOTAL_ROW_LABEL_PREFIX = "סך הכל";

const EMPTY_TARGETS: FairnessTargets = { supervisorTarget: null, technicianTarget: null };

interface FairnessHeaderLocation {
  headerRowIndex: number;
  /** Column of "שם" -- every other fairness column is a fixed offset from this one. */
  nameCol: number;
}

/**
 * Structurally parses one Potential sheet's separate Fairness table
 * ("טבלת צדק") into person rows + totals + period targets. Never touches
 * the sheet's operational Potential block (`lib/parsers/potential.ts`
 * owns that) -- these are separate domains that happen to share a tab.
 *
 * Returns an empty/null result (never throws) when the exact six-header
 * row can't be found -- a missing/renamed fairness table is honest empty
 * data, not a guess.
 */
export function parseFairnessTable(sheet: RawSheet, personnel: readonly Person[]): FairnessTableParseResult {
  const header = findFairnessHeader(sheet.values);
  if (!header) return { personRows: [], totals: null, targets: EMPTY_TARGETS };

  const { headerRowIndex, nameCol } = header;
  const peopleByNormalizedName = groupPeopleByNormalizedName(personnel);

  const personRows: FairnessPersonRow[] = [];
  let totals: FairnessTableParseResult["totals"] = null;
  let targetsSearchStartRow = sheet.values.length;

  for (let row = headerRowIndex + 1; row < sheet.values.length; row++) {
    const cells = sheet.values[row] ?? [];
    const name = cellToTrimmedString(cells[nameCol]);
    if (name === "") continue; // blank separator row -- skipped, never stops the scan.

    if (name.startsWith(TOTAL_ROW_LABEL_PREFIX)) {
      totals = {
        reportedPreviousTotal: parseFairnessNumber(cellToString(cells[nameCol + 2])),
        reportedCurrentTotal: parseFairnessNumber(cellToString(cells[nameCol + 3])),
        reportedWeekendTotal: parseFairnessNumber(cellToString(cells[nameCol + 4])),
        sourceSheet: sheet.name,
        sourceCell: toA1Cell(row, nameCol),
      };
      targetsSearchStartRow = row + 1;
      break; // Explanation/note rows below the total are never treated as people (PR #15 §7).
    }

    personRows.push({
      sourceName: name,
      resolvedPersonId: resolveSourcePersonId(name, peopleByNormalizedName),
      allocationLabel: cellToTrimmedString(cells[nameCol + 1]),
      previousScore: parseFairnessNumber(cellToString(cells[nameCol + 2])),
      currentScore: parseFairnessNumber(cellToString(cells[nameCol + 3])),
      weekendCount: parseFairnessNumber(cellToString(cells[nameCol + 4])),
      exemptions: parseExemptions(cellToString(cells[nameCol + 5])),
      sourceSheet: sheet.name,
      sourceCell: toA1Cell(row, nameCol),
    });
  }

  const targets = findFairnessTargets(sheet.values, targetsSearchStartRow);

  return { personRows, totals, targets };
}

function findFairnessHeader(values: readonly RawCellValue[][]): FairnessHeaderLocation | null {
  const width = gridWidth(values as RawCellValue[][]);

  for (let row = 0; row < values.length; row++) {
    for (let col = 0; col <= width - FAIRNESS_HEADER_LABELS.length; col++) {
      const isMatch = FAIRNESS_HEADER_LABELS.every(
        (label, offset) => cellToTrimmedString(values[row]?.[col + offset]) === label,
      );
      if (isMatch) return { headerRowIndex: row, nameCol: col };
    }
  }

  return null;
}

function normalizeAllocationText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function groupPeopleByNormalizedName(personnel: readonly Person[]): ReadonlyMap<string, Person[]> {
  const map = new Map<string, Person[]>();
  for (const person of personnel) {
    const key = normalizeAllocationText(person.name);
    const group = map.get(key);
    if (group) group.push(person);
    else map.set(key, [person]);
  }
  return map;
}

/**
 * `resolvedPersonId` is optional context only -- resolves ONLY when the
 * normalized name matches EXACTLY ONE personnel record. Zero or duplicate
 * matches both resolve to `null`, never an arbitrary/last-write-wins pick,
 * no fuzzy matching (PR #15 §8, same convention as
 * `lib/parsers/potential.ts`'s `resolveSourcePersonId`).
 */
function resolveSourcePersonId(
  sourceName: string,
  peopleByNormalizedName: ReadonlyMap<string, Person[]>,
): string | null {
  const matches = peopleByNormalizedName.get(normalizeAllocationText(sourceName));
  return matches?.length === 1 ? matches[0].id : null;
}

/** "-" means unavailable/not-applicable and must NEVER become 0 (PR #15 §9). Blank also means unavailable. */
function parseFairnessNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Comma-separated, trimmed raw exemption labels -- "-"/blank means no exemptions. Order preserved, never deduplicated (the sheet's own text is the source of truth). */
function parseExemptions(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") return [];
  return trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

// A bare "X" is never matched inside "2X" -- \b requires a transition between
// a word char and a non-word char, and "2"/"X" are both word chars, so there
// is no boundary between them.
const SUPERVISOR_TARGET_RE = /\bX\s*=\s*(-?\d+(?:\.\d+)?)/;
const TECHNICIAN_TARGET_RE = /\b2X\s*=\s*(-?\d+(?:\.\d+)?)/;

/**
 * Locates and parses the period-specific "X = N | 2X = M - ..." target
 * note below the fairness table (PR #15 §12/§13). Each row's cells are
 * joined into one string before matching, so the note parses whether it
 * lives in one cell or is split across several. Requires BOTH X and 2X to
 * match on the SAME row to accept it -- a missing/malformed note (e.g. the
 * legend line "ערך הקצאת טכנאי = 2X | ... = X", which has no digits at
 * all) never produces a guessed target.
 */
function findFairnessTargets(values: readonly RawCellValue[][], fromRow: number): FairnessTargets {
  for (let row = fromRow; row < values.length; row++) {
    const joined = (values[row] ?? []).map((cell) => cellToString(cell)).join(" ");
    const supervisorMatch = SUPERVISOR_TARGET_RE.exec(joined);
    const technicianMatch = TECHNICIAN_TARGET_RE.exec(joined);
    if (!supervisorMatch || !technicianMatch) continue;

    const supervisorTarget = Number(supervisorMatch[1]);
    const technicianTarget = Number(technicianMatch[1]);
    if (Number.isFinite(supervisorTarget) && Number.isFinite(technicianTarget)) {
      return { supervisorTarget, technicianTarget };
    }
  }

  return EMPTY_TARGETS;
}
