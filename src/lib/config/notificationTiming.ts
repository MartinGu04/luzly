/**
 * PR #30's original single source of truth for notification-engine timing
 * has narrowed: every MANAGER-CONFIGURABLE reminder send time (tomorrow
 * shift/duty/logistics-withdrawal, the logistics noon/supervisor
 * variants, עלמ״ש check-in, weekly constraints) moved to the Fixed /
 * Recurring Notifications Center's persisted `notification_rules` table
 * (see `supabase/migrations/*_create_notification_rules.sql` and
 * `lib/notifications/engine/ruleConfig.ts`) -- that table is the runtime
 * source of truth for those times from that migration onward, seeded
 * once from what used to live here. This file is no longer consulted by
 * `reminders.ts` at all.
 *
 * What remains here are genuinely NON-manager-configurable operational
 * constants -- values a manager must never be able to edit through the
 * notification center, because they describe real-world operational
 * facts (when logistics withdrawals physically happen) or worker
 * cadence, not a notification's send time. Every value is either a plain
 * duration (minutes) or an explicit `{ hour, minute }` in the OPERATIONAL
 * timezone (Asia/Jerusalem) -- never the deployment server's implicit
 * timezone. Consumers convert an `{ hour, minute }` against a
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

/**
 * Logistics withdrawals (משיכות מהלוגיסטיקה) actually happen 13:00–14:00
 * Asia/Jerusalem -- the operational window every logistics-coordination
 * eligibility/overlap check (`logisticsCoordination.ts`) resolves against,
 * via the existing shift-interval resolver. Centralized here, never a
 * literal `780`/`840` scattered elsewhere. This is an OPERATIONAL fact
 * (when the work itself happens), not a notification send time -- never
 * exposed as a manager-editable Fixed Notifications Center field.
 */
export const LOGISTICS_WITHDRAWAL_WINDOW_START: LocalClockTime = { hour: 13, minute: 0 };
export const LOGISTICS_WITHDRAWAL_WINDOW_END: LocalClockTime = { hour: 14, minute: 0 };

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
