/**
 * A local civil-clock reading (product timezone: Asia/Jerusalem), expressed
 * as plain calendar/clock fields rather than a `Date` -- every comparison
 * against `Event.date`/shift-minute timelines elsewhere in `domain` stays
 * pure string/number arithmetic, never routed through `Date`/UTC.
 *
 * Producing one from the actual current instant is a runtime-boundary
 * concern (see `lib/time`), not a domain concern -- this file is only the
 * shape.
 */
export interface LocalNow {
  /** "YYYY-MM-DD" */
  date: string;
  /** 0..1439 */
  minuteOfDay: number;
}
