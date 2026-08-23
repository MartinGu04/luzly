/**
 * Read-only diagnostic CLI for auditing a specific person's Shift Fairness
 * `actualShifts` number back to its exact source spreadsheet cells --
 * written to investigate a report that a card showed 8 completed shifts
 * for someone believed to only reach 8 on a later date.
 *
 * Never writes anything (מי-מה-מו stays read-only) -- one `batchGet` call,
 * the same real parsing/engine functions the app itself uses, then plain
 * console output. Run locally, with the SAME real `.env.local` credentials
 * (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SPREADSHEET_ID)
 * the app itself uses:
 *
 *   npx tsx --conditions=react-server scripts/debug-shift-fairness-person.ts "לאה" 2026-08
 *
 * `--conditions=react-server` is REQUIRED -- several modules this script
 * imports (`fetchRawWorkbookSnapshot`, `getJerusalemLocalNow`, the
 * personnel/schedule parsers) are marked `import "server-only"`, which
 * throws unconditionally under a plain Node/tsx run; that flag is what
 * makes Node pick the package's `react-server` (no-op) export condition
 * instead, exactly like Next's own server bundling does. Omitting it fails
 * immediately with "This module cannot be imported from a Client
 * Component module" before any real work happens.
 *
 * Month argument is optional -- defaults to the real current Jerusalem-
 * local month, same as the live page's own default.
 *
 * Prints:
 *  - the resolved Jerusalem "now" and the exact periodDates window this run
 *    used (should be 2026-08-01..2026-08-23 for a same-day run)
 *  - every RAW schedule-sheet entry for the matched person this month,
 *    confirmed or not, past or future -- so you can see EVERYTHING entered
 *    for her, not just what counts
 *  - the exact subset listContributingShiftEvents/computeShiftFairnessForGroup
 *    actually count as "actualShifts", with sourceCell (A1 notation) so you
 *    can jump straight to that cell in the real sheet
 */
import { fetchRawWorkbookSnapshot } from "@/lib/google/fetchWorkbookSnapshot";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseEvent } from "@/lib/parsers/event";
import {
  resolveShiftFairnessPeriodDates,
  listContributingShiftEvents,
  computeShiftFairnessForGroup,
} from "@/lib/domain/fairnessShiftEngine";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { parseMonthParam, calendarMonthOfLocalNow } from "@/lib/domain/calendarMonth";

async function main() {
  const [, , namePart, monthArg] = process.argv;
  if (!namePart) {
    console.error('Usage: npx tsx scripts/debug-shift-fairness-person.ts "<name substring>" [YYYY-MM]');
    process.exit(1);
  }

  const now = getJerusalemLocalNow();
  const month = parseMonthParam(monthArg ?? null) ?? calendarMonthOfLocalNow(now);
  console.log("Resolved Jerusalem 'now':", now);
  console.log("Resolved month:", month);

  const snapshot = await fetchRawWorkbookSnapshot(["personnel", "schedule"]);
  const people = parsePersonnelSheet(snapshot.sheets.find((s) => s.name === 'כ"א')!);

  const matches = people.filter((p) => p.name.includes(namePart));
  if (matches.length === 0) {
    console.error(`No roster person matched "${namePart}". Known names:`, people.map((p) => p.name));
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`Ambiguous match for "${namePart}":`, matches.map((p) => p.name));
    process.exit(1);
  }
  const person = matches[0];
  console.log("Matched person:", person);

  const scheduleSheet = snapshot.sheets.find((s) => s.name === "משמרות + תורנויות")!;
  const rawAssignments = parseScheduleSheet(scheduleSheet, people);
  const events = rawAssignments.map(parseEvent);

  const periodDates = resolveShiftFairnessPeriodDates(month, now);
  console.log(`periodDates window: ${periodDates[0]} .. ${periodDates[periodDates.length - 1]} (${periodDates.length} days)`);

  // EVERYTHING entered for this person this month, whatever it is.
  const allThisPersonThisMonth = events
    .filter((e) => e.personId === person.id && e.date.startsWith(monthArg ?? now.date.slice(0, 7)))
    .sort((a, b) => a.date.localeCompare(b.date));
  console.log(`\nALL raw entries for ${person.name} this month (${allThisPersonThisMonth.length}):`);
  for (const e of allThisPersonThisMonth) {
    console.log(
      `  ${e.date} [${e.period}] category=${e.category} role=${e.role} certainty=${e.certainty} shadow=${e.shadow} ` +
        `rawValue="${e.rawValue}" sourceCell=${e.sourceCell}`,
    );
  }

  for (const role of ["technician", "supervisor"] as const) {
    const contributing = listContributingShiftEvents(events, person.id, role, periodDates);
    console.log(`\nContributing to actualShifts for role="${role}" (${contributing.length}):`);
    for (const e of contributing) {
      console.log(`  ${e.date} [${e.period}] sourceCell=${e.sourceCell} rawValue="${e.rawValue}"`);
    }

    const engineResult = computeShiftFairnessForGroup(role, people, events, periodDates).people.find(
      (r) => r.personId === person.id,
    );
    console.log(`  computeShiftFairnessForGroup actualShifts=${engineResult?.actualShifts} target=${engineResult?.target}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
