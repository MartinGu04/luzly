# lib/time

The one place allowed to turn a real instant into a civil clock reading via
`Date`/`Intl`. Everywhere else — `lib/domain`, `lib/readModels` — consumes
the resulting `LocalNow` (`lib/domain/localNow.ts`) and does plain
string/number arithmetic on it, never `Date`/UTC again.

- `jerusalemClock.ts` — `getJerusalemLocalNow(instant?)`, converting an
  instant (default: now) into the product's operational timezone,
  Asia/Jerusalem, via a timezone-aware `Intl.DateTimeFormat` — DST
  transitions come from the platform's timezone database, never a
  hard-coded UTC+2/UTC+3 offset.
