import { addCalendarDays, formatCalendarDate } from "./dateRange";
import { daysBetweenCalendarDates, parseCalendarDate } from "./dutyBlocks";

/**
 * Justice Table redesign -- Duty pace. Progress ("how much of the target is
 * completed?") and pace ("given how much of the relevant period has
 * elapsed, are they where they should be?") are two DIFFERENT questions --
 * this module answers only the second one, from two already-known
 * percentages (progress % and period-elapsed %), never re-deriving either
 * one itself.
 *
 * VERIFIED LIMITATION carried over unchanged from `lib/domain/fairnessParticipation.ts`'s
 * own README-documented gap: כ"א carries no reliable stored join/leave/
 * service-window date for any person, and Duty Fairness (unlike Shift
 * Fairness) has never modeled a per-person participation window at all. A
 * "Regular Service End Date" personnel field and a reliable join date are
 * both assumed by the product spec but do not exist in this codebase today
 * -- inventing either would violate "do not silently guess operational
 * reality". `computePeriodElapsedPercent` therefore uses the SAME whole-
 * period elapsed fraction for every person (period start -> effective
 * cutoff, uniformly), which is honest given no better per-person data
 * exists, and preserves current behavior rather than fabricating a
 * personalized participation window.
 */

/**
 * `"suspended"` (spec section 19) -- while Emergency Mode is CURRENTLY
 * active, operational duties are suspended, so elapsed period time must
 * never be read as "behind schedule". Deliberately its own explicit
 * state rather than a null pace or a forced "on_pace" -- both would
 * misrepresent WHY no below/on/ahead judgment applies right now.
 */
export type DutyPaceStatus = "below_pace" | "on_pace" | "ahead_of_pace" | "suspended";

/** ±5 percentage points -- the spec's own stated tolerance band around "on pace". */
export const DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS = 5;

/**
 * How much of `[periodStartDate, periodEndDate]` has elapsed as of
 * `effectiveEndDate` (the caller's already-resolved `min(today, periodEnd)`
 * -- same value `buildDutyFairnessReadModel.ts` already computes for
 * `computeCompletedDutyAllocation`), as a 0-100 percentage. `null` when any
 * date fails to parse or the period itself is zero/negative length --
 * never a guessed percentage. The result is always clamped to `[0, 100]`,
 * so a not-yet-started or already-finished period never produces a
 * percentage outside that range.
 */
export function computePeriodElapsedPercent(
  periodStartDate: string,
  periodEndDate: string,
  effectiveEndDate: string,
): number | null {
  const totalDays = daysBetweenCalendarDates(periodStartDate, periodEndDate);
  const elapsedDays = daysBetweenCalendarDates(periodStartDate, effectiveEndDate);
  if (totalDays === null || elapsedDays === null || totalDays <= 0) return null;

  const clampedElapsed = Math.min(Math.max(elapsedDays, 0), totalDays);
  return (clampedElapsed / totalDays) * 100;
}

/**
 * Emergency Mode's post-deactivation pace resumption (spec section 19):
 * "numerator = elapsed non-emergency dates, denominator = total non-
 * emergency dates in the fairness period" -- so a past emergency pause
 * never permanently makes everybody look behind, and by the end of the
 * period, elapsed progress still reaches 100% of the NON-EMERGENCY
 * period timeline (excluded dates count toward neither side). The
 * source TARGET itself is never altered -- this only recomputes the
 * ELAPSED-TIME denominator/numerator pace is judged against.
 *
 * Enumerates every calendar date in `[periodStartDate, periodEndDate]`
 * day-by-day (a Duty Fairness H1/H2 period is at most ~183 days, so this
 * is cheap) -- deliberately not a closed-form day-count subtraction,
 * since `excludedDates` can be scattered anywhere in the range, not a
 * single contiguous block. Returns `null` under the exact same
 * conditions as `computePeriodElapsedPercent` (unparseable dates, or a
 * period with zero non-emergency days at all -- never a division by
 * zero, never a fabricated percentage).
 */
export function computePeriodElapsedPercentExcludingDates(
  periodStartDate: string,
  periodEndDate: string,
  effectiveEndDate: string,
  excludedDates: ReadonlySet<string>,
): number | null {
  if (excludedDates.size === 0) {
    return computePeriodElapsedPercent(periodStartDate, periodEndDate, effectiveEndDate);
  }

  const start = parseCalendarDate(periodStartDate);
  const end = parseCalendarDate(periodEndDate);
  if (!start || !end) return null;

  let totalDays = 0;
  let elapsedDays = 0;
  let cursor = start;
  let cursorStr = formatCalendarDate(cursor);
  for (let i = 0; cursorStr <= periodEndDate && i < 3660; i++) {
    if (!excludedDates.has(cursorStr)) {
      totalDays += 1;
      if (cursorStr <= effectiveEndDate) elapsedDays += 1;
    }
    cursor = addCalendarDays(cursor, 1);
    cursorStr = formatCalendarDate(cursor);
  }

  if (totalDays <= 0) return null;
  const clampedElapsed = Math.min(Math.max(elapsedDays, 0), totalDays);
  return (clampedElapsed / totalDays) * 100;
}

/**
 * Compares `progressPercent` (target-completion %) against `elapsedPercent`
 * (how much of the relevant period has passed) with a
 * `±DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS` tolerance band -- within it is
 * `"on_pace"`, below is `"below_pace"`, above is `"ahead_of_pace"`. Both
 * inputs are plain 0-100 percentages the caller already resolved; this
 * function has no notion of dates itself.
 */
export function resolveDutyPaceStatus(progressPercent: number, elapsedPercent: number): DutyPaceStatus {
  const diff = progressPercent - elapsedPercent;
  if (diff > DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS) return "ahead_of_pace";
  if (diff < -DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS) return "below_pace";
  return "on_pace";
}
