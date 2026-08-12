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
