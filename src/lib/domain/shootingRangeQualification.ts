import { daysInCalendarMonth } from "./calendarMonth";
import { formatCalendarDate } from "./dateRange";
import { daysBetweenCalendarDates, parseCalendarDate, type CalendarDate } from "./dutyBlocks";
import { classifyPersonnelType, isShiftCapable, type RoleGroupable } from "./personnelType";

/**
 * Shooting-range ("מטווחים") qualification validity rules -- pure calendar-
 * date arithmetic only, no `Date`/`Intl`/timezone anywhere in this file
 * (same convention as `calendarMonth.ts`/`dateRange.ts`). Converting a
 * calendar date to a real Asia/Jerusalem instant (for the live countdown)
 * is a separate, later step -- see `lib/time/jerusalemClock.ts`'s
 * `jerusalemStartOfDayInstant`/`jerusalemEndOfDayInstant`, used only from
 * the read-model orchestration/presentation layer, never from here.
 *
 * The core invariant (spec): a VERIFIED completion date becomes the
 * person's baseline; validity expires exactly 6 CALENDAR months later,
 * through the end of that expiry calendar day. A new verified completion
 * always resets the window from its own date -- never extends an old one.
 */
export const QUALIFICATION_VALIDITY_MONTHS = 6;

/** <= this many days until expiry (inclusive) is "מתקרב לחידוש" -- see `classifyQualificationStatus`. */
export const EXPIRING_SOON_THRESHOLD_DAYS = 30;

/** <= this many days until expiry (inclusive) is "פג בקרוב" -- takes priority over `EXPIRING_SOON_THRESHOLD_DAYS`. */
export const EXPIRING_VERY_SOON_THRESHOLD_DAYS = 7;

/**
 * `date` plus `months` calendar months, EDATE-style (the same semantics as
 * the sheet's own documented `=EDATE(B2,6)` formula, and the ONLY month-add
 * semantics this codebase uses): the month rolls forward/back by exactly
 * `months`, and the day is clamped to the target month's last real day when
 * the original day doesn't exist there (e.g. 31 Aug + 6 -> 28/29 Feb, never
 * an invalid "31 Feb" or a silent rollover into March). Deliberately not
 * "180 days" or "6 * 30 days" -- see this module's own top comment.
 */
export function addCalendarMonths(date: CalendarDate, months: number): CalendarDate {
  const zeroBasedTotal = date.month - 1 + months;
  const yearOffset = Math.floor(zeroBasedTotal / 12);
  const targetMonth = ((zeroBasedTotal % 12) + 12) % 12 + 1;
  const targetYear = date.year + yearOffset;
  const day = Math.min(date.day, daysInCalendarMonth(targetYear, targetMonth));
  return { year: targetYear, month: targetMonth, day };
}

/**
 * The qualification expiry date for a verified completion on `performedOn`
 * ("YYYY-MM-DD") -- `performedOn` plus `QUALIFICATION_VALIDITY_MONTHS`
 * calendar months. `null` for an unparseable `performedOn`, never a guess.
 */
export function computeQualificationExpiryDate(performedOn: string): string | null {
  const parsed = parseCalendarDate(performedOn);
  if (!parsed) return null;
  return formatCalendarDate(addCalendarMonths(parsed, QUALIFICATION_VALIDITY_MONTHS));
}

/** The minimal shape `isEligibleForShootingRanges` needs. */
export interface ShootingRangeEligibilityCandidate extends RoleGroupable {
  personnelType: string | null;
}

/**
 * The ONE place this feature's eligibility rule is decided: regular
 * service (`classifyPersonnelType(...) === "regular"`, i.e. חובה) AND
 * shift-capable (`isShiftCapable`, i.e. אחמ"ש or טכנאי). Composes the two
 * EXISTING canonical classifiers from `personnelType.ts` -- never a third,
 * duplicated role/service inference, and never a text/name-based guess.
 * Every server entry point (personal loader, manager overview, self-report,
 * planned-range scheduling) calls this SAME function -- see
 * `lib/shootingRanges/README.md` for the full list of call sites.
 *
 * A permanent (קבע) or reserve (מילואים) person is out of scope regardless
 * of role; a regular (חובה) person who is neither אחמ"ש nor טכנאי is
 * equally out of scope -- both are simply not eligible, never surfaced as
 * "missing qualification data".
 */
export function isEligibleForShootingRanges(person: ShootingRangeEligibilityCandidate): boolean {
  return classifyPersonnelType(person.personnelType) === "regular" && isShiftCapable(person);
}

export type QualificationStatus = "valid" | "expiring_soon" | "expiring_very_soon" | "expired" | "none";

/**
 * Classifies validity from `expiryDate` alone, as of the civil date
 * `today` (both "YYYY-MM-DD", Asia/Jerusalem) -- "none" (no fabricated
 * expiry) when there is no baseline at all. Qualification is valid THROUGH
 * THE END of `expiryDate` itself (spec: "valid through the end of the
 * expiry calendar day"), so `today === expiryDate` is still valid (and,
 * being within the 7-day window, "expiring_very_soon") -- only
 * `today > expiryDate` is "expired". Thresholds are evaluated on whole
 * civil days until expiry, most-urgent first.
 */
export function classifyQualificationStatus(expiryDate: string | null, today: string): QualificationStatus {
  if (expiryDate === null) return "none";

  const daysUntilExpiry = daysBetweenCalendarDates(today, expiryDate);
  if (daysUntilExpiry === null) return "none";

  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= EXPIRING_VERY_SOON_THRESHOLD_DAYS) return "expiring_very_soon";
  if (daysUntilExpiry <= EXPIRING_SOON_THRESHOLD_DAYS) return "expiring_soon";
  return "valid";
}
