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
  return fairnessPeriodIdentityLabel({ key: period, year: Number(now.date.slice(0, 4)) });
}

/**
 * A specific half-year Fairness/Potential period -- WHICH half (`key`) AND
 * WHICH year (`year`) it's for. `resolveFairnessPeriod` alone only answers
 * "h1 or h2?" -- two dates a year apart (e.g. a 2026 issue and a 2027
 * issue, both in January) resolve to the SAME `key` ("h1") but are NOT the
 * same period. This pairs the two together so callers can tell those apart
 * with exact equality (PR #39 §"year-safe Fairness evidence"), instead of
 * every caller re-deriving/comparing years ad hoc.
 */
export interface FairnessPeriodIdentity {
  key: FairnessPeriodKey;
  year: number;
}

/** `resolveFairnessPeriod` plus the year `now` itself falls in -- the full identity of the period `now` (or an issue/event date wrapped as a `LocalNow`) belongs to. */
export function resolveFairnessPeriodIdentity(
  raw: string | null | undefined,
  now: LocalNow,
): FairnessPeriodIdentity {
  return { key: resolveFairnessPeriod(raw, now), year: Number(now.date.slice(0, 4)) };
}

/** Same formatting as `fairnessPeriodLabel`, but reads the year from an already-resolved `FairnessPeriodIdentity` instead of `LocalNow` -- lets a caller that already resolved identity (e.g. PR #3's `buildDutyFairnessReadModel`) label it accurately even when `identity.year` differs from `now`'s own year (PR #39 year-safety, same convention as `resolveReserveRoleParticipation`). */
export function fairnessPeriodIdentityLabel(identity: FairnessPeriodIdentity): string {
  return identity.key === "h1" ? `1–6/${identity.year}` : `7–12/${identity.year}`;
}

/**
 * The period's own calendar end date -- h1 ends 30/6, h2 ends 31/12, of
 * `identity.year` (PR #3). Deliberately the ONLY place a duty period's end
 * date is computed -- feeds `fairnessFoundation.ts`'s
 * `resolveFairnessPeriodStatus`, which is itself period-SHAPE-agnostic by
 * design (it only ever takes a plain end-date string, never an h1/h2 key),
 * so this is the one place that knows h1/h2 actually mean Jan-Jun/Jul-Dec.
 */
export function fairnessPeriodEndDate(identity: FairnessPeriodIdentity): string {
  return identity.key === "h1" ? `${identity.year}-06-30` : `${identity.year}-12-31`;
}

/**
 * The period's own calendar start date -- h1 starts 1/1, h2 starts 1/7, of
 * `identity.year`. Companion to `fairnessPeriodEndDate` above -- deliberately
 * the ONLY place a duty period's start date is computed, feeding the raw
 * completed-duty count (`fairnessAnalysis.ts`'s `countCompletedDutiesForPerson`),
 * which needs a real `[start, end]` date range to restrict real schedule
 * Events to the SELECTED H1/H2 period.
 */
export function fairnessPeriodStartDate(identity: FairnessPeriodIdentity): string {
  return identity.key === "h1" ? `${identity.year}-01-01` : `${identity.year}-07-01`;
}
