import "server-only";
import { Location, Zmanim } from "@hebcal/core";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";

/**
 * A real preset in @hebcal/core's built-in city database (verified: never
 * undefined at module load) -- resolved once, module-level, exactly like
 * every other constant-configuration value in this codebase.
 */
const JERUSALEM_LOCATION = Location.lookup("Jerusalem");

/**
 * מוצ״ש (motzei Shabbat) for the Saturday named by `dateStr` -- tzeit
 * hakochavim at 8.5° solar depression (three small stars visible), the
 * same default @hebcal/core itself uses for Havdalah when no
 * `havdalahMins`/`havdalahDeg` override is given, and the definition most
 * general-purpose Israeli calendars/sites use. Computed via NOAA solar
 * position for Jerusalem's real coordinates (`@hebcal/core`'s `Zmanim`,
 * already a project dependency -- `lib/presentation/hebrewCalendar.ts`
 * uses the same package for holiday resolution) -- never a hardcoded
 * clock time, since מוצ״ש genuinely moves by well over three hours across
 * the year.
 *
 * The returned `Date` is a real absolute instant (`.toISOString()` gives
 * the correct UTC moment) despite being computed from a LOCAL-component
 * `Date` -- `Zmanim` reads back the same local getters
 * (`getFullYear`/`getMonth`/`getDate`) it was constructed from, exactly
 * like `HDate` already does in `hebrewCalendar.ts`'s `toLocalJsDate` --
 * so this is safe regardless of the server runtime's own timezone.
 *
 * `dateStr` is never required to actually BE a Saturday -- this always
 * just returns "nightfall for this calendar date"; the caller
 * (`reminders.ts`) is the one that only invokes this for a Saturday
 * check-in date. Returns `null` for an unparseable date, never throws.
 */
export function resolveMotzashShabbatInstant(dateStr: string): Date | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed || !JERUSALEM_LOCATION) return null;

  const localDate = new Date(parsed.year, parsed.month - 1, parsed.day);
  const zmanim = new Zmanim(JERUSALEM_LOCATION, localDate, false);
  return zmanim.tzeit(8.5);
}
