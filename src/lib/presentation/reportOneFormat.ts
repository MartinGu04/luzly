import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import type { ReportOneDraft } from "@/lib/domain/reportOne";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "26/08/2026" -- zero-padded day/month/year, the exact form the report title uses. Returns null for an unparseable date, never a guessed date. */
export function formatReportOneDateSlash(dateStr: string): string | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return null;
  return `${pad2(parsed.day)}/${pad2(parsed.month)}/${parsed.year}`;
}

/** "26.08" -- zero-padded day.month, for the Home quick action's "מוכן עבור..." subtitle. Deliberately zero-padded, unlike `formatCompactDate`'s unpadded "12.8" used elsewhere. */
export function formatReportOneDateDot(dateStr: string): string | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return null;
  return `${pad2(parsed.day)}.${pad2(parsed.month)}`;
}

/** "דוח 1: 26/08/2026🛰️" -- the report's own title line, also reused as the Home action's dynamic heading. */
export function formatReportOneTitle(targetDate: string): string {
  return `דוח 1: ${formatReportOneDateSlash(targetDate) ?? targetDate}🛰️`;
}

/**
 * Builds the final plain-text report from `draft` plus the editor's current
 * per-person status text (`statusByPersonId`, keyed by `ReportOnePerson.personId`
 * -- falls back to the draft's own `generatedStatus` for any person not
 * present in the map, so an unmodified row never loses its generated text).
 *
 * Preserves section ordering, the exact Hebrew section headers (emoji +
 * colon), and a blank line between sections (never before the first
 * section, never after the last) -- a section with zero people still
 * prints its header, so the report's four-part structure stays visually
 * predictable regardless of the day's roster.
 */
export function formatReportOneText(draft: ReportOneDraft, statusByPersonId: Readonly<Record<string, string>>): string {
  const lines: string[] = [formatReportOneTitle(draft.targetDate)];

  draft.sections.forEach((section, index) => {
    if (index > 0) lines.push("");
    lines.push(section.label);
    for (const person of section.people) {
      const status = statusByPersonId[person.personId] ?? person.generatedStatus;
      lines.push(`${person.name} - ${status}`);
    }
  });

  return lines.join("\n");
}
