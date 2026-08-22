import { daysBetweenCalendarDates } from "./dutyBlocks";

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

export type DutyPaceStatus = "below_pace" | "on_pace" | "ahead_of_pace";

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
