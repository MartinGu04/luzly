import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import type { LocalNow } from "@/lib/domain/localNow";
import { parseEvent } from "@/lib/parsers/event";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { buildPersonalScheduleReadModel } from "./buildPersonalScheduleReadModel";

/**
 * Real-world regression: a display-only "סוגר" status cell in the actual
 * source workbook shape was reaching `Event[]` correctly (via
 * `parseScheduleSheet` -> `parseEvent`, exactly as any other cell), but
 * never showed up on the person's own "הלוח שלי" month calendar -- the
 * personal calendar's `calendarEvents` filter (`isCalendarDisplayEvent` at
 * the time) allowed only shift/duty/absence through, silently dropping
 * every other calendar-worthy category.
 *
 * This test drives the FULL real pipeline -- a synthetic but real-shaped
 * `RawSheet` (the same multi-block schedule-sheet structure
 * `lib/parsers/schedule.test.ts` uses) through `parseScheduleSheet`,
 * `parseEvent`, and `buildPersonalScheduleReadModel` -- rather than
 * constructing an `Event` literal directly, so a future regression
 * anywhere in that chain (not just the calendar filter) would be caught
 * here too. Deliberately synthetic personnel/dates -- never the specific
 * real person or date the bug was originally observed on.
 */
describe("real-shaped 'סוגר' status cell reaches the personal month calendar (regression)", () => {
  function syntheticPerson(name: string): Person {
    return {
      id: `id_${name}`,
      name,
      email: null,
      isManager: false,
      isTechnician: true,
      isSupervisor: false,
      personnelType: null,
      dischargeDate: null,
      enlistmentDate: null,
    };
  }

  const PERSON = syntheticPerson("עומר בדיקה");
  const personnel = [PERSON];

  // Same real multi-block schedule-sheet shape as the actual workbook --
  // date/day header pair, then the person's own column, with a "סוגר" cell
  // among ordinary shift text on neighboring rows.
  const scheduleSheet: RawSheet = {
    name: "משמרות + תורנויות",
    values: [
      ["תאריך", "יום", "עומר בדיקה"],
      ["01/09/2026", "ג", "בוקר"],
      ["02/09/2026", "ד", "סוגר"],
      ["03/09/2026", "ה", ""],
    ],
  };

  it("the raw 'סוגר' cell reaches parsed Event[] as category 'status', unmodified", () => {
    const rawAssignments = parseScheduleSheet(scheduleSheet, personnel);
    const events = rawAssignments.map(parseEvent);

    const statusEvent = events.find((event) => event.rawValue === "סוגר");
    expect(statusEvent).toBeDefined();
    expect(statusEvent?.category).toBe("status");
    expect(statusEvent?.title).toBe("סוגר");
    expect(statusEvent?.date).toBe("2026-09-02");
  });

  it("that same Event then reaches the personal calendar's calendarEvents, not just todayEvents/upcomingEvents", () => {
    const rawAssignments = parseScheduleSheet(scheduleSheet, personnel);
    const events = rawAssignments.map(parseEvent);

    const model = buildPersonalScheduleReadModel({
      person: PERSON,
      people: personnel,
      events,
      shiftSchedule: buildShiftSchedule("07:30"),
      fetchedAt: "2026-09-01T08:00:00.000Z",
      now: { date: "2026-09-01", minuteOfDay: 10 * 60 } satisfies LocalNow,
    });

    const calendarStatusEvent = model.calendarEvents.find((event) => event.date === "2026-09-02");
    expect(calendarStatusEvent).toBeDefined();
    expect(calendarStatusEvent?.category).toBe("status");
    expect(calendarStatusEvent?.title).toBe("סוגר");

    // Also reaches the un-filtered day-level view, as it always did.
    expect(model.todayEvents.some((event) => event.title === "בוקר")).toBe(true);
  });
});
