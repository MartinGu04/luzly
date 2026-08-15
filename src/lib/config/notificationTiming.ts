/**
 * PR #30's single source of truth for every notification-engine timing
 * value -- the spec explicitly requires these centralized rather than
 * scattered across components/SQL/routes. Every value here is either a
 * plain duration (minutes) or an explicit `{ hour, minute }` in the
 * OPERATIONAL timezone (Asia/Jerusalem) -- never the deployment server's
 * implicit timezone. Consumers convert an `{ hour, minute }` against a
 * `LocalNow`/`getJerusalemLocalNow()` reading, exactly like every other
 * timezone-safe computation in this codebase (see `lib/time/jerusalemClock.ts`).
 *
 * No I/O, no env vars -- pure configuration, safe to import from both
 * server and pure domain/engine code.
 */

/** Suggested Supabase Cron cadence for the production worker (manual setup, not enforced in code). */
export const WORKER_CADENCE_MINUTES = 5;

/** Quiet-period debounce: a semantic change settles this many minutes after its LAST observed change. */
export const SEMANTIC_CHANGE_DEBOUNCE_MINUTES = 10;

export interface LocalClockTime {
  hour: number;
  minute: number;
}

/** 20:00 Asia/Jerusalem, the day before the shift. */
export const TOMORROW_SHIFT_REMINDER_TIME: LocalClockTime = { hour: 20, minute: 0 };

/** 20:00 Asia/Jerusalem, the day before the duty. */
export const TOMORROW_DUTY_REMINDER_TIME: LocalClockTime = { hour: 20, minute: 0 };

/** 18:00 Asia/Jerusalem, Sunday. */
export const CONSTRAINTS_SUNDAY_REMINDER_TIME: LocalClockTime = { hour: 18, minute: 0 };

/** 09:00 Asia/Jerusalem, Monday. */
export const CONSTRAINTS_MONDAY_REMINDER_TIME: LocalClockTime = { hour: 9, minute: 0 };

export function clockTimeToMinuteOfDay(time: LocalClockTime): number {
  return time.hour * 60 + time.minute;
}
