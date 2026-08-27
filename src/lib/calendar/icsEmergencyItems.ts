import "server-only";
import { createHash } from "node:crypto";
import type { EmergencyShift, EmergencyShiftPeriod } from "@/lib/domain/emergencyShift";
import type { ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { minuteOnDateToInstant } from "./icsItems";
import type { IcsCalendarItem } from "./icsRender";

const PERIOD_LABEL: Record<EmergencyShiftPeriod, string> = { day: "יום", night: "לילה" };

/**
 * A stable, opaque VEVENT UID for one person's Emergency Mode desk shift --
 * keyed on person+date+period (the same identity `buildEmergencyPersonalHome.ts`
 * already groups shifts by), not a per-cell `sourceCell` hash the way
 * `icsItems.ts`'s own `calendarEventUid` is: one person can occupy more
 * than one desk cell on the SAME date+period (`EmergencyPersonalShiftEntry.ownDesks`),
 * and this feed renders that as ONE calendar item, not one per desk. The
 * "emergency-shift|" prefix keeps this in a distinct hash namespace from
 * `calendarEventUid`'s own `sourceSheet!sourceCell` input, so the two can
 * never collide even if a regular feed and an emergency feed for the same
 * person were ever compared.
 */
export function emergencyShiftEventUid(personId: string, date: string, period: EmergencyShiftPeriod): string {
  return createHash("sha256").update(`emergency-shift|${personId}|${date}|${period}`, "utf8").digest("hex");
}

/**
 * Turns one Emergency Mode desk shift into an ICS calendar item for the
 * viewed person's own external subscription feed (spec section 16) --
 * mirrors `icsItems.ts`'s own `buildCalendarItem` for a regular shift
 * Event, but desk-based: SUMMARY names the person's own desk(s), never a
 * regular role/coverage concept, and no roster/coverage description
 * beyond who else shares the same desk shift.
 *
 * `schedule === null` (the REGULAR workbook's shift-time configuration is
 * broken) skips the item entirely -- same "never an invented time" rule
 * the regular feed already follows. Emergency shifts reuse the SAME day/
 * night start/end minutes as regular shifts (see
 * `buildEmergencyPersonalHome.ts`'s own docs for why that reuse is
 * correct), so no second shift-timing concept is introduced here.
 *
 * Returns `null` when the viewed person has no assignment in this shift
 * at all (should not normally happen -- callers only pass shifts the
 * person is actually part of -- but this stays defensive rather than
 * emitting a desk-less item).
 */
export function buildEmergencyShiftCalendarItem(
  shift: EmergencyShift,
  personId: string,
  schedule: ShiftSchedule | null,
): IcsCalendarItem | null {
  if (schedule === null) return null;

  const ownDesks = shift.assignments.filter((assignment) => assignment.personId === personId).map((assignment) => assignment.desk);
  if (ownDesks.length === 0) return null;

  const { startMinute, endMinute } =
    shift.period === "day"
      ? { startMinute: schedule.dayStartMinute, endMinute: schedule.dayEndMinute }
      : { startMinute: schedule.nightStartMinute, endMinute: schedule.nightEndMinute };

  const summary = `🚨 משמרת ${PERIOD_LABEL[shift.period]} · דסק ${ownDesks.join(", ")}`;

  const others = shift.assignments.filter((assignment) => assignment.personId !== personId);
  const description = others.length > 0 ? others.map((assignment) => `${assignment.personName} -- ${assignment.desk}`).join("\n") : null;

  return {
    uid: emergencyShiftEventUid(personId, shift.date, shift.period),
    summary,
    description,
    timing: {
      kind: "timed",
      startUtc: minuteOnDateToInstant(shift.date, startMinute),
      endUtc: minuteOnDateToInstant(shift.date, endMinute),
    },
    color: null,
  };
}
