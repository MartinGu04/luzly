import "server-only";
import { createHash } from "node:crypto";
import { addCalendarDays, formatCalendarDate } from "@/lib/domain/dateRange";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import type { Event } from "@/lib/domain/event";
import { MINUTES_PER_DAY, resolveEventShiftInterval, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { absenceKindLabel, dutyFamilyLabel, periodLabel, roleLabel } from "@/lib/presentation/labels";
import { jerusalemLocalTimeToInstant } from "@/lib/time/jerusalemClock";
import { icsEventColor } from "./icsColor";
import { icsEventEmoji, withEmojiPrefix } from "./icsEmoji";
import { buildShiftRosterDescription } from "./icsRoster";
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
 *
 * `allEvents` -- the FULL, unfiltered, every-person Event set for the
 * shift-roster description (see `icsRoster.ts`) -- is only ever read for
 * `category === "shift"`; duty/absence Events never receive a roster
 * (PR spec §5: no meaningful "who's with me" for those categories).
 */
export function buildCalendarItem(
  event: Event,
  schedule: ShiftSchedule | null,
  allEvents: readonly Event[],
): IcsCalendarItem | null {
  if (event.category === "shift") {
    if (schedule === null) return null;
    const resolution = resolveEventShiftInterval(event, schedule);
    if (resolution.status !== "resolved") return null;

    return {
      uid: calendarEventUid(event),
      summary: buildShiftSummary(event),
      description: buildShiftDescription(event, allEvents),
      timing: {
        kind: "timed",
        startUtc: minuteOnDateToInstant(event.date, resolution.interval.startMinute),
        endUtc: minuteOnDateToInstant(event.date, resolution.interval.endMinute),
      },
      color: icsEventColor(event),
    };
  }

  if (event.category === "duty") {
    return {
      uid: calendarEventUid(event),
      summary: buildDutySummary(event),
      description: buildDutyOrAbsenceDescription(event),
      timing: { kind: "allDay", date: event.date },
      color: icsEventColor(event),
    };
  }

  // category === "absence" (the only remaining case `isCalendarDisplayEvent` allows through).
  return {
    uid: calendarEventUid(event),
    summary: buildAbsenceSummary(event),
    description: buildDutyOrAbsenceDescription(event),
    timing: { kind: "allDay", date: event.date },
    color: icsEventColor(event),
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
  const withShadow = event.shadow ? `${summary} (צל)` : summary;
  return withEmojiPrefix(icsEventEmoji(event), withShadow);
}

/**
 * `allEvents` feeds `buildShiftRosterDescription` -- see that function's
 * own docstring for why it must be the full, unfiltered, every-person set.
 * The roster block (when non-null) is appended AFTER the existing
 * tentative/override/change-note lines, separated by a blank line, so
 * neither block's presence/absence shifts the other's meaning.
 */
function buildShiftDescription(event: Event, allEvents: readonly Event[]): string | null {
  const lines: string[] = [];
  if (event.certainty === "tentative") lines.push("משובץ באופן משוער -- טרם אושר סופית");
  if (event.startTimeOverride !== null || event.endTimeOverride !== null) {
    lines.push("שעות המשמרת חורגות מהשעון הרגיל");
  }
  if (event.changeNote !== null) lines.push(event.changeNote);

  const roster = buildShiftRosterDescription(event, allEvents);

  if (lines.length === 0) return roster;
  if (roster === null) return lines.join("\n");
  return [lines.join("\n"), roster].join("\n\n");
}

function buildDutySummary(event: Event): string {
  const label = event.dutyFamily === null ? event.title : dutyFamilyLabel(event.dutyFamily);
  const withSlot = event.dutyFamily !== null && event.slot !== null ? `${label} ${event.slot}` : label;
  return withEmojiPrefix(icsEventEmoji(event), withSlot);
}

function buildAbsenceSummary(event: Event): string {
  const label = event.absenceKind !== null ? absenceKindLabel(event.absenceKind) : event.title;
  return withEmojiPrefix(icsEventEmoji(event), label);
}

function buildDutyOrAbsenceDescription(event: Event): string | null {
  const lines: string[] = [];
  if (event.certainty === "tentative") lines.push("משובץ באופן משוער -- טרם אושר סופית");
  if (event.changeNote !== null) lines.push(event.changeNote);
  return lines.length > 0 ? lines.join("\n") : null;
}
