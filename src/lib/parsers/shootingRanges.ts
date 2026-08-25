import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parseLocalDate } from "./date";
import { cellToTrimmedString, findColumnIndexByHeader, toA1Cell } from "./sheetGrid";

const NAME_HEADERS = ["שם", "שם מלא", "שם עובד"];
const PERFORMED_ON_HEADERS = ["תאריך ביצוע מטווח", "תאריך ביצוע", "תאריך"];

/**
 * Any one of these being present is enough to recognize the "מטווחים"
 * header row -- same idiom as `personnel.ts`/`potential.ts`. The manually
 * entered "תאריך תפוגת התוקף" / "בתוקף / לא תקף" columns are DELIBERATELY
 * never looked up here at all (no header constant, no column index, no
 * field on `ShootingRangeSheetRecord`) -- see this file's own top comment
 * for why: they are never business truth in this app, only
 * `performedOn` is.
 */
const RECOGNIZED_LABEL_GROUPS = [NAME_HEADERS, PERFORMED_ON_HEADERS];

/**
 * One row of the "מטווחים" sheet, structurally parsed. This is the ONLY
 * shape this parser produces -- the sheet's own manually-entered
 * "תאריך תפוגת התוקף" (expiry) and "בתוקף / לא תקף" (valid/invalid) columns
 * are read by NOTHING in this codebase; see the spec's own "IMPORTANT
 * SOURCE-OF-TRUTH RULE" (מטווחים feature): the authoritative field is
 * `תאריך ביצוע מטווח` alone, and expiry/validity are always DERIVED from it
 * (`lib/domain/shootingRangeQualification.ts`), never read off a manual
 * cell that could silently drift from the truth.
 *
 * `resolvedPersonId` follows the exact same fail-closed convention as
 * `potential.ts`'s `resolveSourcePersonId`: set only when the row's name
 * text matches EXACTLY ONE current כ"א record by normalized name. Zero or
 * 2+ matches both leave it `null` -- an ambiguous/unknown name is never
 * guessed onto a specific person, and the read model (`readModels/
 * shootingRangeQualification.ts`) surfaces an unresolved row as a data
 * issue rather than silently dropping or misattributing it.
 */
export interface ShootingRangeSheetRecord {
  sourceName: string;
  resolvedPersonId: string | null;
  /** "YYYY-MM-DD" -- the row's `תאריך ביצוע מטווח` value. Can be in the past (a completed range) or the future (a planned one); see the read model for how the two are told apart. */
  performedOn: string;
  sourceSheet: string;
  sourceCell: string;
}

/**
 * Structurally parses the "מטווחים" sheet into `ShootingRangeSheetRecord[]`,
 * resilient to header order/position (columns are located by header text,
 * never fixed letters -- same convention as every other tabular parser in
 * `lib/parsers`). A row with a blank name or an unparseable `performedOn`
 * date is skipped entirely, never guessed.
 */
export function parseShootingRangesSheet(sheet: RawSheet, personnel: readonly Person[]): ShootingRangeSheetRecord[] {
  const headerRowIndex = sheet.values.findIndex((row) =>
    RECOGNIZED_LABEL_GROUPS.some((labels) => findColumnIndexByHeader(row, labels) !== -1),
  );
  if (headerRowIndex === -1) return [];

  const headerRow = sheet.values[headerRowIndex] ?? [];
  const nameCol = findColumnIndexByHeader(headerRow, NAME_HEADERS);
  const performedOnCol = findColumnIndexByHeader(headerRow, PERFORMED_ON_HEADERS);
  if (nameCol === -1 || performedOnCol === -1) return [];

  const peopleByNormalizedName = new Map<string, Person[]>();
  for (const person of personnel) {
    const key = normalizeName(person.name);
    const group = peopleByNormalizedName.get(key);
    if (group) group.push(person);
    else peopleByNormalizedName.set(key, [person]);
  }

  const records: ShootingRangeSheetRecord[] = [];

  for (let row = headerRowIndex + 1; row < sheet.values.length; row++) {
    const cells = sheet.values[row] ?? [];
    const sourceName = cellToTrimmedString(cells[nameCol]);
    if (!sourceName) continue;

    const performedOn = parseLocalDate(cellToTrimmedString(cells[performedOnCol]));
    if (!performedOn) continue; // blank/malformed completion date -- skipped, never guessed (spec: "blank completion date -> no qualification").

    records.push({
      sourceName,
      resolvedPersonId: resolvePersonId(sourceName, peopleByNormalizedName),
      performedOn,
      sourceSheet: sheet.name,
      sourceCell: toA1Cell(row, nameCol),
    });
  }

  return records;
}

/**
 * Invisible Unicode bidi/formatting marks that real-world Hebrew
 * spreadsheet text (pasted or exported from different sources/apps) can
 * carry without any VISIBLE difference at all: LTR mark (U+200E), RTL mark
 * (U+200F), the Arabic letter mark (U+061C), explicit bidi embedding/
 * override (U+202A-U+202E), and bidi isolates (U+2066-U+2069). Left in
 * place, these make an otherwise byte-for-byte-identical-LOOKING name fail
 * a strict equality check -- a real, known root cause of "this is
 * definitely the same person's name, why doesn't it match" in cross-sheet
 * name resolution. Written entirely as `\u` escapes (never a literal
 * invisible character in source) so this file's own text stays inspectable
 * and can't itself silently pick up a stray control character.
 */
const BIDI_CONTROL_CHARS_RE = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

/** Non-breaking space (U+00A0) -- visually indistinguishable from a regular space, but not matched by `\s`-based whitespace collapsing without this explicit normalization first. */
const NBSP_RE = /\u00A0/g;

/**
 * Normalizes a person's name for cross-sheet comparison: Unicode canonical
 * composition (`NFC` -- the same visible Hebrew name can be represented
 * with different underlying code point sequences depending on which
 * application/keyboard produced it), invisible bidi/formatting mark
 * removal (`BIDI_CONTROL_CHARS_RE`), non-breaking-space normalization,
 * then the pre-existing whitespace-collapse + trim. Applied identically to
 * BOTH the sheet's own name text and every כ"א personnel name before
 * comparison, so this hardens matching for BOTH sides at once regardless
 * of which sheet the invisible/differently-encoded text originated from.
 *
 * Still exact-match only -- this narrows what counts as "the same text",
 * it does not add any fuzzy/partial matching. A genuine spelling/word-order
 * difference between the two sheets still fails closed to `null`, exactly
 * as intended.
 */
function normalizeName(text: string): string {
  return text
    .normalize("NFC")
    .replace(BIDI_CONTROL_CHARS_RE, "")
    .replace(NBSP_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exact-normalized-name match only, resolved against EXACTLY one personnel record -- zero or 2+ matches both fail closed to `null`. No fuzzy matching either way, matching `potential.ts`'s `resolveSourcePersonId`. */
function resolvePersonId(sourceName: string, peopleByNormalizedName: ReadonlyMap<string, Person[]>): string | null {
  const matches = peopleByNormalizedName.get(normalizeName(sourceName));
  return matches?.length === 1 ? matches[0].id : null;
}
