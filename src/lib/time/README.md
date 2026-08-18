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
- `motzashShabbat.ts` — `resolveMotzashShabbatInstant(dateStr)`, the
  real astronomical מוצ״ש (tzeit hakochavim, 8.5°) for a given Saturday,
  via `@hebcal/core`'s `Zmanim`/`Location` (NOAA solar calculation for
  Jerusalem's real coordinates) — never a hardcoded clock time, since
  מוצ״ש moves by hours across the year.
