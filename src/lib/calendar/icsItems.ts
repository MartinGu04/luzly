import "server-only";
import { createHash } from "node:crypto";
import { addCalendarDays, formatCalendarDate } from "@/lib/domain/dateRange";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import type { Event } from "@/lib/domain/event";
import { MINUTES_PER_DAY, resolveEventShiftInterval, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { absenceKindLabel, dutyFamilyLabel, periodLabel, roleLabel } from "@/lib/presentation/labels";
import { jerusalemLocalTimeToInstant } from "@/lib/time/jerusalemClock";
import type { IcsCalendarItem } from "./icsRender";

/**
 * Every calendar-worthy `EventCategory`, in the exact sense
 * `buildPersonalScheduleReadModel.ts`'s own `isCalendarDisplayEvent`
 * already established for "הלוח שלי" -- shift, duty, and absence. Exported
 * from there (not redefined here) so the ICS feed and the in-app personal
 * calendar can never silently drift into two different definitions of
 * "calendar-worthy".
 */
export { isCalendarDisplayEvent } from "@/lib/readModels/buildPersonalScheduleReadModel";

/**
 * A stable, opaque VEVENT UID for one Event, keyed ONLY on its spreadsheet
 * origin (`sourceSheet`+`sourceCell`) -- the same "one Event = one cell"
 * identity `compareEventsForDisplay`'s own final tie-break already treats
 * as this codebase's canonical per-assignment identity. This is what makes
 * the feed a real subscription rather than a one-time export (PR spec
 * §2): editing that cell's text (e.g. a start-time override) changes the
 * VEVENT's DTSTART/SUMMARY on the next refresh but keeps the SAME UID, so
 * calendar clients update the existing entry instead of duplicating it;
 * the cell being removed/reassigned to someone else simply means this
 * UID never appears in a future generation again, for anyone.
 *
 * Hashed (SHA-256) rather than used verbatim so the UID never leaks the
 * underlying sheet name/cell reference to an external calendar client.
 */
export function calendarEventUid(event: Pick<Event, "sourceSheet" | "sourceCell">): string {
  return createHash("sha256").update(`${event.sourceSheet}!${event.sourceCell}`, "utf8").digest("hex");
}

/**
 * Turns one shift/duty/absence `Event` into UTC start/end instants
 * (respecting `startTimeOverride`/`endTimeOverride`, DST-safe via
 * `jerusalemLocalTimeToInstant`) or a single all-day calendar date --
 * whichever `resolveEventShiftInterval` and the Event's own category call
 * for. `schedule === null` (a broken shift-time configuration -- see
 * `buildShiftSchedule`) means every shift Event is skipped rather than
 * given an invented time; duty/absence Events are entirely unaffected,
 * since they were never schedule-dependent to begin with.
 *
 * Returns `null` for a shift Event whose interval can't be resolved
 * (unspecified period, an out-of-range override) -- never a guessed
 * start/end, matching every other timing computation in this codebase.
 */
export function buildCalendarItem(event: Event, schedule: ShiftSchedule | null): IcsCalendarItem | null {
  if (event.category === "shift") {
    if (schedule === null) return null;
    const resolution = resolveEventShiftInterval(event, schedule);
    if (resolution.status !== "resolved") return null;

    return {
      uid: calendarEventUid(event),
      summary: buildShiftSummary(event),
      description: buildShiftDescription(event),
      timing: {
        kind: "timed",
        startUtc: minuteOnDateToInstant(event.date, resolution.interval.startMinute),
        endUtc: minuteOnDateToInstant(event.date, resolution.interval.endMinute),
      },
    };
  }

  if (event.category === "duty") {
    return {
      uid: calendarEventUid(event),
      summary: buildDutySummary(event),
      description: buildDutyOrAbsenceDescription(event),
      timing: { kind: "allDay", date: event.date },
    };
  }

  // category === "absence" (the only remaining case `isCalendarDisplayEvent` allows through).
  return {
    uid: calendarEventUid(event),
    summary: buildAbsenceSummary(event),
    description: buildDutyOrAbsenceDescription(event),
    timing: { kind: "allDay", date: event.date },
  };
}

/**
 * Resolves a (possibly >1439, for an overnight end) shift-timeline minute
 * anchored on `date` into a real UTC instant -- rolling the minute onto
 * its actual calendar date first (pure integer/calendar-date arithmetic),
 * then converting that local Asia/Jerusalem wall-clock time via
 * `jerusalemLocalTimeToInstant`, the same DST-safe conversion the
 * notification engine already uses for scheduling. Never touches
 * `Date`/UTC before this final step.
 */
function minuteOnDateToInstant(date: string, minute: number): Date {
  const dayOffset = Math.floor(minute / MINUTES_PER_DAY);
  const minuteOfDay = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(minuteOfDay / 60);
  const minuteOfHour = minuteOfDay % 60;

  if (dayOffset === 0) return jerusalemLocalTimeToInstant(date, hour, minuteOfHour);

  const parsed = parseCalendarDate(date);
  const targetDate = parsed ? formatCalendarDate(addCalendarDays(parsed, dayOffset)) : date;
  return jerusalemLocalTimeToInstant(targetDate, hour, minuteOfHour);
}

// ---------------------------------------------------------------------------
// Summary / description copy -- reuses the SAME Hebrew label mappings
// `lib/presentation/labels.ts` already provides for the in-app UI (and
// `lib/notifications/engine/copy.ts` already reuses for push copy), never
// a third independent set of strings.
// ---------------------------------------------------------------------------

function buildShiftSummary(event: Event): string {
  const role = roleLabel(event.role);
  const period = periodLabel(event.period);
  const base = [role, period].filter((part): part is string => part !== null).join(" ");
  const summary = base !== "" ? base : event.title;
  return event.shadow ? `${summary} (צל)` : summary;
}

function buildShiftDescription(event: Event): string | null {
  const lines: string[] = [];
  if (event.certainty === "tentative") lines.push("משובץ באופן משוער -- טרם אושר סופית");
  if (event.startTimeOverride !== null || event.endTimeOverride !== null) {
    lines.push("שעות המשמרת חורגות מהשעון הרגיל");
  }
  if (event.changeNote !== null) lines.push(event.changeNote);
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildDutySummary(event: Event): string {
  if (event.dutyFamily === null) return event.title;
  const label = dutyFamilyLabel(event.dutyFamily);
  return event.slot !== null ? `${label} ${event.slot}` : label;
}

function buildAbsenceSummary(event: Event): string {
  return event.absenceKind !== null ? absenceKindLabel(event.absenceKind) : event.title;
}

function buildDutyOrAbsenceDescription(event: Event): string | null {
  const lines: string[] = [];
  if (event.certainty === "tentative") lines.push("משובץ באופן משוער -- טרם אושר סופית");
  if (event.changeNote !== null) lines.push(event.changeNote);
  return lines.length > 0 ? lines.join("\n") : null;
}
