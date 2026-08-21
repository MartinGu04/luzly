import { formatHebrewWeekdayAndDate } from "./hebrewDate";

/**
 * "20:00" from a minute-of-day (0-1439, wraps like `LocalNow.minuteOfDay`),
 * zero-padded `HH:MM`. Pure -- no `Date`/`Intl`, same philosophy as every
 * other formatter in this directory.
 */
export function formatClockTime(minuteOfDay: number): string {
  const normalized = ((minuteOfDay % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * "יום ראשון · 23 באוגוסט בשעה 20:00" -- the scheduled-broadcast composer
 * and "🕒 התראות מתוזמנות" list's one human-readable Israel-local moment
 * string. `dateStr`/`minuteOfDay` must ALREADY be Israel-local civil
 * values -- this function never converts a UTC instant itself (that
 * conversion is `jerusalemClock.ts`'s `getJerusalemLocalNow`, a
 * server-only concern; by the time a value reaches here it's either the
 * composer's own local date/time picker input, or a server action's
 * already-converted `LocalNow`). Returns `null` for an unparseable date,
 * never throws.
 */
export function formatScheduledBroadcastMoment(dateStr: string, minuteOfDay: number): string | null {
  const datePart = formatHebrewWeekdayAndDate(dateStr);
  if (!datePart) return null;
  return `${datePart} בשעה ${formatClockTime(minuteOfDay)}`;
}
