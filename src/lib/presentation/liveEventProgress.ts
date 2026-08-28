/**
 * Pure timing/progress engine for the Home hero card's live element (the
 * "הבא שלך"/"פעיל עכשיו" countdown-then-progress bar) -- no `Date` object,
 * no React, no timers. Every instant is a plain epoch-ms number so this is
 * trivially testable and trivially advanced by a component ticking `now`
 * forward. The real start/end instants are resolved once, server-side, via
 * `lib/time/jerusalemClock` (the app's one Asia/Jerusalem interpretation)
 * -- this file never repeats that conversion, only does arithmetic on the
 * resulting numbers.
 */

export type LiveEventProgressMode = "hidden" | "countdown" | "active";

export interface LiveEventProgressState {
  mode: LiveEventProgressMode;
  /** 0..100, clamped. 0 for "hidden". */
  progressPercent: number;
  /** Countdown: minutes until start. Active: minutes until end. 0 for "hidden". */
  remainingMinutes: number;
}

export interface ComputeLiveEventProgressInput {
  /** Epoch ms. */
  now: number;
  /** Epoch ms, the event's real start instant -- `null` when it has no usable start time (all-day/vacation/date-only events never reach this). */
  start: number | null;
  /** Epoch ms, the event's real end instant -- `null` when unknown. Active progress never renders without one; a countdown to start doesn't need it. */
  end: number | null;
}

/** A countdown only ever appears in the final 24h before an event starts -- further out, nothing renders. */
const COUNTDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;

const HIDDEN: LiveEventProgressState = { mode: "hidden", progressPercent: 0, remainingMinutes: 0 };

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * `start - 24h = 0%`, `start = 100%` for the pre-start countdown;
 * `start = 0%`, `end = 100%` for progress through the event once it has
 * begun. Never invents a boundary: no usable `start` is always hidden, an
 * event more than 24h out is hidden (no invented long-range countdown),
 * and active progress never renders without a genuine `end` -- even once
 * `now` has passed `start` -- rather than pretending one exists.
 */
export function computeLiveEventProgress({ now, start, end }: ComputeLiveEventProgressInput): LiveEventProgressState {
  if (start === null) return HIDDEN;

  if (now < start) {
    const msUntilStart = start - now;
    if (msUntilStart > COUNTDOWN_WINDOW_MS) return HIDDEN;
    const progressPercent = clampPercent(((COUNTDOWN_WINDOW_MS - msUntilStart) / COUNTDOWN_WINDOW_MS) * 100);
    return { mode: "countdown", progressPercent, remainingMinutes: Math.round(msUntilStart / 60_000) };
  }

  if (end === null || now >= end) return HIDDEN;

  const progressPercent = clampPercent(((now - start) / (end - start)) * 100);
  return { mode: "active", progressPercent, remainingMinutes: Math.round((end - now) / 60_000) };
}
