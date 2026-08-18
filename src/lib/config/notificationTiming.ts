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

/** 20:00 Asia/Jerusalem, the day before a logistics-withdrawal (משיכות מהלוגיסטיקה) assignment. Also the time the day-before SUPERVISOR coordination notification fires (see `logisticsCoordination.ts`). */
export const TOMORROW_LOGISTICS_WITHDRAWAL_REMINDER_TIME: LocalClockTime = { hour: 20, minute: 0 };

/**
 * Logistics withdrawals (משיכות מהלוגיסטיקה) actually happen 13:00–14:00
 * Asia/Jerusalem -- the operational window every logistics-coordination
 * eligibility/overlap check (`logisticsCoordination.ts`) resolves against,
 * via the existing shift-interval resolver. Centralized here, never a
 * literal `780`/`840` scattered elsewhere.
 */
export const LOGISTICS_WITHDRAWAL_WINDOW_START: LocalClockTime = { hour: 13, minute: 0 };
export const LOGISTICS_WITHDRAWAL_WINDOW_END: LocalClockTime = { hour: 14, minute: 0 };

/** 12:00 Asia/Jerusalem, the SAME day as the withdrawal -- the team-coordination reminder (assigned technician, relevant supervisor if still unassigned, and eligible teammates). */
export const LOGISTICS_WITHDRAWAL_NOON_REMINDER_TIME: LocalClockTime = { hour: 12, minute: 0 };

/** 18:00 Asia/Jerusalem, Sunday. */
export const CONSTRAINTS_SUNDAY_REMINDER_TIME: LocalClockTime = { hour: 18, minute: 0 };

/** 09:00 Asia/Jerusalem, Monday. */
export const CONSTRAINTS_MONDAY_REMINDER_TIME: LocalClockTime = { hour: 9, minute: 0 };

/**
 * 12:45 Asia/Jerusalem, the SAME day as the עלמ״ש check-in itself (13:00) --
 * Sunday-Friday only. Saturday never uses this: the check-in is pushed
 * out to מוצ״ש instead (see `lib/time/motzashShabbat.ts`), so 13:00 is
 * never actually reachable/relevant on a Saturday.
 */
export const ALMASH_CHECKIN_REMINDER_TIME: LocalClockTime = { hour: 12, minute: 45 };

export function clockTimeToMinuteOfDay(time: LocalClockTime): number {
  return time.hour * 60 + time.minute;
}

/** {startMinute, endMinute} form of the withdrawal window, derived from the two clock-time constants above so they can never drift apart. */
export interface MinuteWindow {
  startMinute: number;
  endMinute: number;
}

export const LOGISTICS_WITHDRAWAL_WINDOW: MinuteWindow = {
  startMinute: clockTimeToMinuteOfDay(LOGISTICS_WITHDRAWAL_WINDOW_START),
  endMinute: clockTimeToMinuteOfDay(LOGISTICS_WITHDRAWAL_WINDOW_END),
};
