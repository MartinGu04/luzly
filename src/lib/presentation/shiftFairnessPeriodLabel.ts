/**
 * "תקופת החישוב: אוגוסט 2026 · עד היום" for the actual current Jerusalem-
 * local calendar month, "תקופת החישוב: יולי 2026" for anything else --
 * makes explicit that Shift Fairness is a MONTHLY calculation, and that
 * every actual/target/gap value on the page below refers to exactly this
 * period. Pure formatting over the already-resolved `monthLabel` (the
 * page's own `formatHebrewMonthYear` output) and `isCurrentMonth` (the
 * page's own `isOnCurrentMonth`, comparing the selected month against
 * `calendarMonthOfLocalNow`) -- never a separate date calculation of its
 * own.
 *
 * Deliberately NOT based on the read model's own `periodStatus`
 * ("current" | "closed", `fairnessFoundation.ts`) -- a wholly FUTURE month
 * is also classified `"current"` there (it simply means "not closed yet",
 * a Shift Fairness domain concept about modelability), so a future month
 * would incorrectly read "עד היום" if this used `periodStatus` directly.
 * `isCurrentMonth` is the one true "is this literally today's month"
 * signal, which is exactly what "עד היום" claims.
 */
export function shiftFairnessPeriodLabel(monthLabel: string, isCurrentMonth: boolean): string {
  const suffix = isCurrentMonth ? " · עד היום" : "";
  return `תקופת החישוב: ${monthLabel}${suffix}`;
}
