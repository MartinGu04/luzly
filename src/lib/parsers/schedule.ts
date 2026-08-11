import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parseLocalDate } from "./date";
import { cellToString, cellToTrimmedString, gridWidth, toA1Cell } from "./sheetGrid";
import type { RawAssignment } from "./types";

const DATE_HEADER_LABELS = ["תאריך"];
const DAY_HEADER_LABELS = ["יום"];

interface ScheduleBlock {
  dateCol: number;
  /** Inclusive start / exclusive end of this block's person-column zone. */
  personZoneStart: number;
  personZoneEnd: number;
}

interface PersonColumn {
  col: number;
  person: Person;
}

/**
 * "משמרות + תורנויות" holds several independent date/day blocks side by
 * side (not one A/B date pair for the whole sheet), and a person can own
 * more than one adjacent column (their name heads the first; further
 * blank-headed columns continue belonging to them until the next
 * recognized person, a non-person header such as notes, or the block
 * boundary). This walks the header row to find those blocks and column
 * ownership structurally, then reads every non-empty owned cell as one
 * RawAssignment. It never classifies what the value means.
 */
export function parseScheduleSheet(sheet: RawSheet, personnel: Person[]): RawAssignment[] {
  const headerRowIndex = sheet.values.findIndex((row) =>
    row.some((cell) => DATE_HEADER_LABELS.includes(cellToTrimmedString(cell))),
  );
  if (headerRowIndex === -1) return [];

  const headerRow = sheet.values[headerRowIndex] ?? [];
  const width = Math.max(gridWidth(sheet.values), headerRow.length);

  const dateCols: number[] = [];
  for (let col = 0; col < headerRow.length; col++) {
    if (DATE_HEADER_LABELS.includes(cellToTrimmedString(headerRow[col]))) {
      dateCols.push(col);
    }
  }

  const personByHeaderName = new Map<string, Person>();
  for (const person of personnel) {
    personByHeaderName.set(normalizeHeaderText(person.name), person);
  }

  const blocks: ScheduleBlock[] = dateCols.map((dateCol, index) => {
    const hasDayCol = DAY_HEADER_LABELS.includes(cellToTrimmedString(headerRow[dateCol + 1]));
    const personZoneStart = dateCol + (hasDayCol ? 2 : 1);
    const personZoneEnd = index + 1 < dateCols.length ? dateCols[index + 1] : width;
    return { dateCol, personZoneStart, personZoneEnd };
  });

  const assignments: RawAssignment[] = [];

  for (const block of blocks) {
    const personColumns = resolvePersonColumns(headerRow, block, personByHeaderName);

    for (let row = headerRowIndex + 1; row < sheet.values.length; row++) {
      const rowCells = sheet.values[row] ?? [];
      const date = parseLocalDate(cellToTrimmedString(rowCells[block.dateCol]));
      if (!date) continue;

      for (const { col, person } of personColumns) {
        const rawValue = cellToString(rowCells[col]);
        if (rawValue.trim() === "") continue;

        assignments.push({
          personId: person.id,
          personName: person.name,
          date,
          rawValue,
          sourceSheet: sheet.name,
          sourceCell: toA1Cell(row, col),
        });
      }
    }
  }

  return assignments;
}

/**
 * Walks one block's header cells left -> right, attributing each column to
 * whichever recognized person "owns" it: their own named column, or a
 * blank continuation column right after it. A non-blank header that isn't a
 * recognized person (notes, free text, etc.) breaks that ownership so
 * later blanks in the block are never misattributed.
 */
function resolvePersonColumns(
  headerRow: RawSheet["values"][number],
  block: ScheduleBlock,
  personByHeaderName: Map<string, Person>,
): PersonColumn[] {
  const personColumns: PersonColumn[] = [];
  let currentOwner: Person | undefined;

  for (let col = block.personZoneStart; col < block.personZoneEnd; col++) {
    const headerText = cellToTrimmedString(headerRow[col]);

    if (headerText === "") {
      if (currentOwner) personColumns.push({ col, person: currentOwner });
      continue;
    }

    const matchedPerson = personByHeaderName.get(normalizeHeaderText(headerText));
    if (matchedPerson) {
      currentOwner = matchedPerson;
      personColumns.push({ col, person: matchedPerson });
    } else {
      currentOwner = undefined;
    }
  }

  return personColumns;
}

function normalizeHeaderText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
