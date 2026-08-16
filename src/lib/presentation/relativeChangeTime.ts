/**
 * "עכשיו" / "לפני 18 דקות" / "לפני שעה" / "אתמול" / "לפני יומיים" -- a
 * restrained, deterministic relative-age label for one settled dashboard
 * change's `happenedAt` (PR #36's "מה השתנה" recap).
 *
 * Deliberately its own helper rather than reusing
 * `formatDataFreshnessLabel` (PR #17) -- that one exists specifically for
 * CLIENT-side, post-mount rendering (to avoid a server/browser clock
 * hydration mismatch) and always prefixes "עודכן" ("updated"), which is
 * the wrong claim for a change that HAPPENED, not merely a snapshot that
 * refreshed. `RecentChangesPanel` renders this from a plain Server
 * Component -- no client hydration is involved, so there is no mismatch
 * risk here: the label is simply recomputed fresh on every request/
 * `AppRevalidator` refresh, same as every other server-rendered field on
 * the dashboard.
 *
 * Pure: takes `now` explicitly rather than reading `Date.now()`/`new
 * Date()` itself, so it is deterministically testable (same convention as
 * `formatDataFreshnessLabel`/`getJerusalemLocalNow`).
 */

const FALLBACK_LABEL = "לאחרונה";
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/**
 * An unparseable `happenedAt` fails safe -- a generic label with no age
 * claim, never a crash, never "NaN". A negative elapsed duration (clock
 * skew reading the instant as being in the future) is treated the same as
 * "just now" -- never "בעוד X שניות".
 */
export function formatRecentChangeRelativeTime(happenedAt: string, now: Date): string {
  const happenedAtMs = Date.parse(happenedAt);
  if (!Number.isFinite(happenedAtMs)) return FALLBACK_LABEL;

  const elapsedSeconds = Math.floor((now.getTime() - happenedAtMs) / 1000);
  if (elapsedSeconds < SECONDS_PER_MINUTE) return "עכשיו";

  const elapsedMinutes = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);
  if (elapsedMinutes < MINUTES_PER_HOUR) {
    return elapsedMinutes === 1 ? "לפני דקה" : `לפני ${elapsedMinutes} דקות`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / MINUTES_PER_HOUR);
  if (elapsedHours < HOURS_PER_DAY) {
    return elapsedHours === 1 ? "לפני שעה" : `לפני ${elapsedHours} שעות`;
  }

  const elapsedDays = Math.floor(elapsedHours / HOURS_PER_DAY);
  if (elapsedDays === 1) return "אתמול";
  if (elapsedDays === 2) return "לפני יומיים";
  return `לפני ${elapsedDays} ימים`;
}
