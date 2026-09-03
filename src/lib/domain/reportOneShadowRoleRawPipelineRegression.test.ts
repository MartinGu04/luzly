import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import type { Person } from "./types";
import { buildReportOneDraft } from "./reportOne";

/**
 * Regression: reported production mismatch where the schedule sheet's own
 * cell -- visibly `אחמ"ש יום - צל` in the schedule UI -- allegedly rendered
 * as `טכנאי יום` in Report 1, producing what looked like two `טכנאי יום`
 * lines. `reportOne.test.ts`'s own unit tests already prove
 * `resolveRegularOrReserveStatus`/`shiftStatusWording` behave correctly
 * once handed an already-typed `Event` with `role: "supervisor"` -- but
 * that only proves the DOMAIN layer is correct in isolation, never that a
 * REAL sheet cell actually produces that Event in the first place.
 *
 * This file closes that gap deliberately at the EARLIEST realistic input
 * boundary: a raw `RawSheet` grid (the exact 2D `values` shape
 * `fetchRawWorkbookSnapshot` returns from Google Sheets, before ANY
 * classification), carrying the literal cell text a manager would type/see
 * in the schedule UI -- run through the SAME `parseScheduleSheet` (raw
 * grid -> `RawAssignment[]`, structural extraction only, "never classifies
 * what the value means" per its own docstring) -> `parseEvent`
 * (classification) -> `buildReportOneDraft` (Report 1's own status
 * resolution) pipeline production actually uses (`lib/readModels/
 * schedule.ts` for the schedule UI, `lib/readModels/reportOneTomorrow.ts`
 * for Report 1 -- see this file's own investigation notes in the PR
 * description for why those two loaders were compared and where they
 * legitimately differ: NOT in this shared parsing pipeline).
 *
 * No Event is ever hand-constructed here -- every Event used below is
 * whatever this exact raw-grid input genuinely produces.
 */

function syntheticPerson(name: string, overrides: Partial<Person> = {}): Person {
  return {
    id: `id_${name}`,
    name,
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: "חובה",
    dischargeDate: null,
    enlistmentDate: null,
    ...overrides,
  };
}

const MANAGER = syntheticPerson("עילאי שפירא", { isSupervisor: true });
const TECHNICIAN = syntheticPerson("איתי אוליר", { isTechnician: true });

const TARGET_DATE = "2026-09-03"; // "תאריך" cell below: 03/09/2026
const PREV_DATE = "2026-09-02";

/**
 * One single-block schedule sheet, shaped exactly like a real "משמרות +
 * תורנויות" export: a header row (תאריך/יום/one column per person) and one
 * data row for `TARGET_DATE`, with `cellText` as the RAW, UNMODIFIED cell
 * value a manager would have typed for the shift-manager's own column --
 * the exact literal string reported as visibly correct in the schedule UI.
 */
function rawScheduleSheet(cellText: string): RawSheet {
  return {
    name: "משמרות + תורנויות",
    values: [
      ["תאריך", "יום", MANAGER.name, TECHNICIAN.name],
      ["03/09/2026", "ה", cellText, "טכנאי יום"],
    ],
  };
}

/** Runs the FULL raw pipeline: grid -> RawAssignment[] -> Event[] -> ReportOneDraft. */
function runRawPipeline(cellText: string) {
  const sheet = rawScheduleSheet(cellText);
  const rawAssignments = parseScheduleSheet(sheet, [MANAGER, TECHNICIAN]);
  const events = rawAssignments.map(parseEvent);
  const draft = buildReportOneDraft({
    people: [MANAGER, TECHNICIAN],
    events,
    targetDate: TARGET_DATE,
    prevDate: PREV_DATE,
  });
  return { rawAssignments, events, draft };
}

function statusFor(draft: ReturnType<typeof runRawPipeline>["draft"], personId: string): string | undefined {
  return draft.sections.flatMap((section) => section.people).find((p) => p.personId === personId)?.generatedStatus;
}

describe("Report 1 raw pipeline -- real spreadsheet grid boundary (never a hand-built Event)", () => {
  it(
    'reproduces the reported scenario: the RAW cell "אחמ"ש יום - צל" survives untouched through ' +
      "parseScheduleSheet's structural extraction, classifies as role=supervisor via parseEvent, " +
      "and Report 1 renders it as אחמ\"ש יום -- NEVER טכנאי יום",
    () => {
      const { rawAssignments, events, draft } = runRawPipeline('אחמ"ש יום - צל');

      // 1. The sheet-grid extraction boundary: the exact literal cell text,
      // byte for byte, with no row/column misattribution -- this is what
      // production's parseScheduleSheet actually handed to the classifier.
      const managerAssignment = rawAssignments.find((a) => a.personId === MANAGER.id);
      expect(managerAssignment?.rawValue).toBe('אחמ"ש יום - צל');
      expect(managerAssignment?.date).toBe(TARGET_DATE);

      // 2. The classification boundary: role/period/shadow independently
      // correct from that exact raw text.
      const managerEvent = events.find((e) => e.personId === MANAGER.id);
      expect(managerEvent).toMatchObject({ category: "shift", role: "supervisor", period: "day", shadow: true });

      // 3. Report 1's own rendered output.
      expect(statusFor(draft, MANAGER.id)).toBe('נוכח, אחמ"ש יום');
      expect(statusFor(draft, TECHNICIAN.id)).toBe("נוכח, טכנאי יום");

      // Exactly ONE טכנאי יום line in the whole draft -- the reported
      // symptom (two טכנאי יום entries) never reproduces from this input.
      const allStatuses = draft.sections.flatMap((section) => section.people).map((p) => p.generatedStatus);
      expect(allStatuses.filter((status) => status === "נוכח, טכנאי יום")).toHaveLength(1);
      expect(allStatuses).not.toContain("נוכח, טכנאי יום, נוכח, טכנאי יום");
    },
  );

  it.each([
    { cellText: "טכנאי יום - צל", expectedRole: "technician", expectedPeriod: "day", expectedStatus: "נוכח, טכנאי יום" },
    { cellText: "טכנאי לילה - צל", expectedRole: "technician", expectedPeriod: "night", expectedStatus: "נוכח, טכנאי לילה" },
    { cellText: 'אחמ"ש יום - צל', expectedRole: "supervisor", expectedPeriod: "day", expectedStatus: 'נוכח, אחמ"ש יום' },
    { cellText: 'אחמ"ש לילה - צל', expectedRole: "supervisor", expectedPeriod: "night", expectedStatus: 'נוכח, אחמ"ש לילה' },
  ])(
    "raw cell '$cellText' -> role=$expectedRole, period=$expectedPeriod, Report 1 status '$expectedStatus' (never crossing role)",
    ({ cellText, expectedRole, expectedPeriod, expectedStatus }) => {
      const { events, draft } = runRawPipeline(cellText);
      const managerEvent = events.find((e) => e.personId === MANAGER.id);

      expect(managerEvent).toMatchObject({ category: "shift", role: expectedRole, period: expectedPeriod, shadow: true });
      expect(statusFor(draft, MANAGER.id)).toBe(expectedStatus);

      // The one invariant every combination must uphold: an אחמ"ש cell
      // never produces טכנאי wording, and vice versa.
      if (expectedRole === "supervisor") {
        expect(statusFor(draft, MANAGER.id)).not.toContain("טכנאי");
      } else {
        expect(statusFor(draft, MANAGER.id)).not.toContain('אחמ"ש');
      }
    },
  );

  it("a non-shadow אחמ\"ש cell in the SAME raw grid shape is unaffected -- shadow parsing was never technician-gated in the first place", () => {
    const { events, draft } = runRawPipeline('אחמ"ש יום');
    const managerEvent = events.find((e) => e.personId === MANAGER.id);
    expect(managerEvent).toMatchObject({ category: "shift", role: "supervisor", period: "day", shadow: false });
    expect(statusFor(draft, MANAGER.id)).toBe('נוכח, אחמ"ש יום');
  });
});
