import type { LocalNow } from "./localNow";

/**
 * Which half-year Potential/Fairness sheet is selected -- "h1" is
 * `פוטנציאל תקש"אס 1-6/2026`, "h2" is `פוטנציאל תקש"אס 7-12/2026` (PR #15
 * §24). Strict allowlist of two values only.
 */
export type FairnessPeriodKey = "h1" | "h2";

const VALID_PERIOD_KEYS: ReadonlySet<string> = new Set(["h1", "h2"]);

/** Strict allowlist parse of the `?period=` query param -- anything else (including missing) is `null`, never a guess. */
export function parseFairnessPeriodParam(raw: string | null | undefined): FairnessPeriodKey | null {
  if (raw !== null && raw !== undefined && VALID_PERIOD_KEYS.has(raw)) {
    return raw as FairnessPeriodKey;
  }
  return null;
}

/** Jan-Jun -> h1, Jul-Dec -> h2, from `LocalNow.date` only -- never a browser-local date (PR #15 §24). */
function periodContaining(now: LocalNow): FairnessPeriodKey {
  const month = Number(now.date.slice(5, 7));
  return month >= 1 && month <= 6 ? "h1" : "h2";
}

/** Resolves the raw `?period=` param against `now` -- an invalid/missing value falls back to the period containing `now`, never a crash. */
export function resolveFairnessPeriod(raw: string | null | undefined, now: LocalNow): FairnessPeriodKey {
  return parseFairnessPeriodParam(raw) ?? periodContaining(now);
}

/** "1–6/2026" / "7–12/2026" -- the year is read from `now`, never hard-coded, so the label stays correct across years. */
export function fairnessPeriodLabel(period: FairnessPeriodKey, now: LocalNow): string {
  const year = now.date.slice(0, 4);
  return period === "h1" ? `1–6/${year}` : `7–12/${year}`;
}
