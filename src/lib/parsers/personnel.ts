import type { RawCellValue, RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parseLocalDate } from "./date";
import { cellToBoolean, cellToTrimmedString, findColumnIndexByHeader } from "./sheetGrid";

const NAME_HEADERS = ["שם", "שם מלא", "שם עובד"];
const EMAIL_HEADERS = ["מייל", "אימייל", 'דוא"ל'];
const MANAGER_HEADERS = ["מנהל"];
const TECHNICIAN_HEADERS = ["טכנאי"];
const SUPERVISOR_HEADERS = ['אחמ"ש'];
const PERSONNEL_TYPE_HEADERS = ['סוג כ"א'];
const DISCHARGE_DATE_HEADERS = ["תאריך שחרור", "צפי שחרור"];
const ENLISTMENT_DATE_HEADERS = ["תאריך גיוס"];

/** Any one of these being present is enough to recognize the personnel header row. */
const RECOGNIZED_LABEL_GROUPS = [
  NAME_HEADERS,
  EMAIL_HEADERS,
  MANAGER_HEADERS,
  TECHNICIAN_HEADERS,
  SUPERVISOR_HEADERS,
  PERSONNEL_TYPE_HEADERS,
  DISCHARGE_DATE_HEADERS,
  ENLISTMENT_DATE_HEADERS,
];

/**
 * Deterministic id derived from the (normalized) name so the same person
 * gets a stable id across parses without needing an external identity
 * source. FNV-1a 32-bit, more than enough entropy for a personnel roster.
 *
 * Exported for reuse by `lib/parsers/historicalDutyPersonnel.ts`, which
 * mints the SAME id shape for a former employee who has left the current
 * כ"א roster but still has real historical Duty Fairness evidence -- the
 * whole point is that id continuity survives a person going in and out of
 * the current roster, so this is deliberately the ONE place that hash is
 * computed, never a second/parallel derivation.
 */
export function stableIdFromName(name: string): string {
  const normalized = name.replace(/\s+/g, " ").trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `p_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Locates columns by header label (not fixed letters) so a reordered כ"א
 * sheet still parses correctly. The real workbook currently has no header
 * above the name column at all — when that happens, the name column is
 * inferred structurally as the populated blank-header column immediately
 * adjacent to the recognized label columns.
 */
export function parsePersonnelSheet(sheet: RawSheet): Person[] {
  const headerRowIndex = sheet.values.findIndex((row) =>
    RECOGNIZED_LABEL_GROUPS.some((labels) => findColumnIndexByHeader(row, labels) !== -1),
  );
  if (headerRowIndex === -1) return [];

  const headerRow = sheet.values[headerRowIndex] ?? [];
  const emailCol = findColumnIndexByHeader(headerRow, EMAIL_HEADERS);
  const managerCol = findColumnIndexByHeader(headerRow, MANAGER_HEADERS);
  const technicianCol = findColumnIndexByHeader(headerRow, TECHNICIAN_HEADERS);
  const supervisorCol = findColumnIndexByHeader(headerRow, SUPERVISOR_HEADERS);
  const typeCol = findColumnIndexByHeader(headerRow, PERSONNEL_TYPE_HEADERS);
  const dischargeDateCol = findColumnIndexByHeader(headerRow, DISCHARGE_DATE_HEADERS);
  const enlistmentDateCol = findColumnIndexByHeader(headerRow, ENLISTMENT_DATE_HEADERS);

  let nameCol = findColumnIndexByHeader(headerRow, NAME_HEADERS);
  if (nameCol === -1) {
    const recognizedCols = [
      emailCol,
      managerCol,
      technicianCol,
      supervisorCol,
      typeCol,
      dischargeDateCol,
      enlistmentDateCol,
    ].filter((col) => col !== -1);
    nameCol = inferUnlabeledNameColumn(sheet.values, headerRowIndex, headerRow, recognizedCols);
  }
  if (nameCol === -1) return [];

  const people: Person[] = [];

  for (let row = headerRowIndex + 1; row < sheet.values.length; row++) {
    const cells = sheet.values[row] ?? [];
    const name = cellToTrimmedString(cells[nameCol]);
    if (!name) continue;

    const email = emailCol !== -1 ? cellToTrimmedString(cells[emailCol]) : "";
    const personnelType = typeCol !== -1 ? cellToTrimmedString(cells[typeCol]) : "";
    const dischargeDate = dischargeDateCol !== -1 ? parseLocalDate(cellToTrimmedString(cells[dischargeDateCol])) : null;
    const enlistmentDate = enlistmentDateCol !== -1 ? parseLocalDate(cellToTrimmedString(cells[enlistmentDateCol])) : null;

    people.push({
      id: stableIdFromName(name),
      name,
      email: email || null,
      isManager: managerCol !== -1 && cellToBoolean(cells[managerCol]),
      isTechnician: technicianCol !== -1 && cellToBoolean(cells[technicianCol]),
      isSupervisor: supervisorCol !== -1 && cellToBoolean(cells[supervisorCol]),
      personnelType: personnelType || null,
      dischargeDate,
      enlistmentDate,
    });
  }

  return people;
}

/**
 * Infers the name column when it has no recognizable header at all (the
 * real כ"א sheet's current shape). Looks at the columns immediately
 * adjacent to the recognized label block — on either side, since the block
 * itself can be reordered/moved — and picks whichever blank-header
 * candidate actually has populated, non-checkbox text beneath it.
 */
function inferUnlabeledNameColumn(
  values: RawCellValue[][],
  headerRowIndex: number,
  headerRow: RawCellValue[],
  recognizedCols: number[],
): number {
  if (recognizedCols.length === 0) return -1;

  const minCol = Math.min(...recognizedCols);
  const maxCol = Math.max(...recognizedCols);
  const candidates = [maxCol + 1, minCol - 1].filter((col) => col >= 0);

  let bestCol = -1;
  let bestScore = 0;

  for (const col of candidates) {
    if (cellToTrimmedString(headerRow[col]) !== "") continue;

    let score = 0;
    for (let row = headerRowIndex + 1; row < values.length; row++) {
      const text = cellToTrimmedString(values[row]?.[col]);
      if (text === "" || ["TRUE", "FALSE"].includes(text.toUpperCase())) continue;
      score++;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }

  return bestCol;
}
