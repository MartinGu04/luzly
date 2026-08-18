import type { FairnessPeriodStatus } from "@/lib/domain/fairnessFoundation";

/**
 * "תקופת החישוב: אוגוסט 2026 · עד היום" for the current (open, still-
 * accruing) month, "תקופת החישוב: יולי 2026" for a closed historical one --
 * makes explicit that Shift Fairness is a MONTHLY calculation, and that
 * every actual/target/gap value on the page below refers to exactly this
 * period. Pure formatting over the already-resolved `monthLabel` (the
 * page's own `formatHebrewMonthYear` output) and `periodStatus` (the read
 * model's own `"current" | "closed"`, from `fairnessFoundation.ts`) --
 * never a separate date calculation of its own.
 */
export function shiftFairnessPeriodLabel(monthLabel: string, periodStatus: FairnessPeriodStatus): string {
  const suffix = periodStatus === "current" ? " · עד היום" : "";
  return `תקופת החישוב: ${monthLabel}${suffix}`;
}
