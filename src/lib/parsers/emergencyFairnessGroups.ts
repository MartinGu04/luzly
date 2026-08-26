import type { RawSheet } from "@/lib/google";
import { cellToTrimmedString, gridWidth } from "./sheetGrid";

/**
 * The four "גזירת נתונים" display groups (spec section 17), preserved
 * verbatim for emergency fairness presentation. GROUP MEMBERSHIP ONLY
 * -- this sheet's own numeric totals are never trusted; the canonical
 * emergency count always comes from `משמרות` C:L (see
 * `lib/domain/emergencyFairness.ts`).
 */
export const EMERGENCY_FAIRNESS_GROUP_LABELS = [
  'טבלת צדק - סדיר תקש"ל',
  'טבלת צדק - סדיר מ"א',
  "טבלת צדק - קבע",
  "טבלת צדק - מילואים",
] as const;

export type EmergencyFairnessGroupLabel = (typeof EMERGENCY_FAIRNESS_GROUP_LABELS)[number];

export interface EmergencyFairnessGroupMembership {
  /** Group label -> raw (as-typed) member names listed under that group. */
  membersByGroup: Record<EmergencyFairnessGroupLabel, string[]>;
}

function emptyMembership(): EmergencyFairnessGroupMembership {
  const membersByGroup = {} as Record<EmergencyFairnessGroupLabel, string[]>;
  for (const label of EMERGENCY_FAIRNESS_GROUP_LABELS) membersByGroup[label] = [];
  return { membersByGroup };
}

/**
 * Parses "גזירת נתונים" for GROUP MEMBERSHIP ONLY. Each of the four
 * "טבלת צדק - ..." labels is treated as a column header; every
 * non-blank cell below it (blank rows are skipped, never treated as an
 * end marker -- same convention as `lib/parsers/fairness.ts`'s "בלנק
 * separator row" handling) is collected as a raw member name for that
 * group, until either the data runs out or another recognized group
 * label appears in the same column (a defensive stop, in case the
 * sheet repeats headers vertically).
 *
 * VERIFIED against the real "גזירת נתונים" sheet layout: the four labels
 * above are column headers, each with member names listed directly
 * beneath it in that same column -- this mirrors the "locate an exact
 * header label, read data beneath it" convention the regular workbook's
 * own "טבלת צדק" side-table parser (`fairness.ts`) uses. Reading is
 * scoped to the single column directly under each header, so any
 * adjacent numeric COUNTIF total columns the real sheet carries are
 * never touched by this parser -- it has no way to read them even by
 * accident (group membership is genuinely all this module extracts).
 * Never throws and never fabricates -- a label this cannot locate
 * simply yields an empty group, and any person who has real emergency
 * assignments but ends up in no group still gets a safe fallback
 * presentation (see `buildEmergencyFairnessReadModel.ts`), so a future
 * layout drift degrades gracefully rather than hiding anyone.
 */
export function parseEmergencyFairnessGroups(sheet: RawSheet): EmergencyFairnessGroupMembership {
  const width = gridWidth(sheet.values);
  const result = emptyMembership();

  for (let row = 0; row < sheet.values.length; row++) {
    for (let col = 0; col < width; col++) {
      const headerText = cellToTrimmedString(sheet.values[row]?.[col]);
      const label = (EMERGENCY_FAIRNESS_GROUP_LABELS as readonly string[]).includes(headerText)
        ? (headerText as EmergencyFairnessGroupLabel)
        : null;
      if (!label) continue;

      for (let dataRow = row + 1; dataRow < sheet.values.length; dataRow++) {
        const name = cellToTrimmedString(sheet.values[dataRow]?.[col]);
        if (name === "") continue;
        if ((EMERGENCY_FAIRNESS_GROUP_LABELS as readonly string[]).includes(name)) break;
        result.membersByGroup[label].push(name);
      }
    }
  }

  return result;
}
