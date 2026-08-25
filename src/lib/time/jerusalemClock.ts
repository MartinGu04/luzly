import "server-only";
import type { LocalNow } from "@/lib/domain/localNow";

const JERUSALEM_TIME_ZONE = "Asia/Jerusalem";

/**
 * Formats an instant into Asia/Jerusalem civil year/month/day/hour/minute
 * parts via `Intl.DateTimeFormat`, so DST transitions come from the
 * platform's timezone database -- never a hard-coded UTC+2/UTC+3 offset.
 */
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: JERUSALEM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Converts an instant (defaults to "now") into the Asia/Jerusalem local
 * calendar date + minute-of-day.
 *
 * This is the ONLY place in the codebase allowed to turn a real instant
 * into a civil clock reading via `Date`/`Intl`. Everywhere downstream
 * (domain rules, read-model building) consumes the resulting `LocalNow`
 * structure and does plain string/number arithmetic on it -- never
 * `Date`/UTC again.
 */
export function getJerusalemLocalNow(instant: Date = new Date()): LocalNow {
  const parts = formatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const found = parts.find((candidate) => candidate.type === type);
    if (!found) throw new Error(`Intl.DateTimeFormat did not produce a "${type}" part.`);
    return found.value;
  };

  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const minuteOfDay = Number(part("hour")) * 60 + Number(part("minute"));

  return { date, minuteOfDay };
}

const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: JERUSALEM_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Asia/Jerusalem's UTC offset (minutes, positive = ahead of UTC) in effect at `instant` -- DST-aware via the platform tz database, never a hard-coded +2/+3. */
function jerusalemUtcOffsetMinutesAt(instant: Date): number {
  const parts = offsetFormatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? "0");

  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asIfUtc - instant.getTime()) / 60_000);
}

/**
 * The reverse of `getJerusalemLocalNow`: given an Asia/Jerusalem civil
 * date + clock time, returns the real UTC instant it refers to. Used
 * exclusively for SCHEDULING future notification jobs at an explicit
 * local time (PR #30 spec section 29: "never use the deployment
 * server's implicit timezone for business decisions") -- never for
 * interpreting `Event`/schedule data, which stays on the pure
 * string/number `LocalNow`/`CalendarDate` arithmetic used everywhere
 * else in `domain`.
 *
 * DST-safe via one correction pass: the offset is first estimated by
 * treating the target wall-clock time as if it were already UTC, then
 * re-derived from that corrected instant -- the only case this doesn't
 * perfectly resolve is a wall-clock time that falls exactly inside a
 * DST transition's skipped/repeated hour, an edge case far outside this
 * app's actual reminder schedule (20:00/18:00/09:00, never near
 * midnight).
 */
export function jerusalemLocalTimeToInstant(dateStr: string, hour: number, minute: number): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  const firstOffset = jerusalemUtcOffsetMinutesAt(new Date(naiveUtcMs));
  const correctedMs = naiveUtcMs - firstOffset * 60_000;

  const secondOffset = jerusalemUtcOffsetMinutesAt(new Date(correctedMs));
  return new Date(naiveUtcMs - secondOffset * 60_000);
}

/**
 * The real UTC instant of 00:00:00.000 Asia/Jerusalem on `dateStr`
 * ("YYYY-MM-DD"). Built on `jerusalemLocalTimeToInstant` -- same DST-safe
 * correction pass, no hard-coded offset.
 */
export function jerusalemStartOfDayInstant(dateStr: string): Date {
  return jerusalemLocalTimeToInstant(dateStr, 0, 0);
}

/**
 * The real UTC instant of the LAST millisecond (23:59:59.999) of
 * Asia/Jerusalem `dateStr`. Used to express "valid through the end of the
 * expiry calendar day" (qualification/expiry semantics, see
 * `lib/domain/shootingRangeQualification.ts`) as a genuine instant rather
 * than a bare date string -- deliberately the end of THIS day, not
 * `jerusalemStartOfDayInstant` of the next one, so a caller never needs to
 * separately reason about month/year rollover just to find "one ms before
 * midnight".
 */
export function jerusalemEndOfDayInstant(dateStr: string): Date {
  return new Date(jerusalemLocalTimeToInstant(dateStr, 23, 59).getTime() + 59_999);
}
