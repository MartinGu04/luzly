import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { cellToBoolean, cellToTrimmedString, findColumnIndexByHeader } from "./sheetGrid";

const NAME_HEADERS = ["שם", "שם מלא", "שם עובד"];
const EMAIL_HEADERS = ["מייל", "אימייל", 'דוא"ל'];
const MANAGER_HEADERS = ["מנהל"];
const TECHNICIAN_HEADERS = ["טכנאי"];
const SUPERVISOR_HEADERS = ['אחמ"ש'];
const PERSONNEL_TYPE_HEADERS = ['סוג כ"א'];

/**
 * Deterministic id derived from the (normalized) name so the same person
 * gets a stable id across parses without needing an external identity
 * source. FNV-1a 32-bit, more than enough entropy for a personnel roster.
 */
function stableIdFromName(name: string): string {
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
 * sheet still parses correctly.
 */
export function parsePersonnelSheet(sheet: RawSheet): Person[] {
  const headerRowIndex = sheet.values.findIndex(
    (row) => findColumnIndexByHeader(row, NAME_HEADERS) !== -1,
  );
  if (headerRowIndex === -1) return [];

  const headerRow = sheet.values[headerRowIndex] ?? [];
  const nameCol = findColumnIndexByHeader(headerRow, NAME_HEADERS);
  const emailCol = findColumnIndexByHeader(headerRow, EMAIL_HEADERS);
  const managerCol = findColumnIndexByHeader(headerRow, MANAGER_HEADERS);
  const technicianCol = findColumnIndexByHeader(headerRow, TECHNICIAN_HEADERS);
  const supervisorCol = findColumnIndexByHeader(headerRow, SUPERVISOR_HEADERS);
  const typeCol = findColumnIndexByHeader(headerRow, PERSONNEL_TYPE_HEADERS);

  const people: Person[] = [];

  for (let row = headerRowIndex + 1; row < sheet.values.length; row++) {
    const cells = sheet.values[row] ?? [];
    const name = cellToTrimmedString(cells[nameCol]);
    if (!name) continue;

    const email = emailCol !== -1 ? cellToTrimmedString(cells[emailCol]) : "";
    const personnelType = typeCol !== -1 ? cellToTrimmedString(cells[typeCol]) : "";

    people.push({
      id: stableIdFromName(name),
      name,
      email: email || null,
      isManager: managerCol !== -1 && cellToBoolean(cells[managerCol]),
      isTechnician: technicianCol !== -1 && cellToBoolean(cells[technicianCol]),
      isSupervisor: supervisorCol !== -1 && cellToBoolean(cells[supervisorCol]),
      personnelType: personnelType || null,
    });
  }

  return people;
}
