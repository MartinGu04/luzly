/** A whole-unit breakdown of a non-negative duration, days/hours/minutes/seconds -- purely presentational, no calendar-month semantics (unlike `lib/domain/shootingRangeQualification.ts`'s expiry math). Distinct from `lib/presentation/duration.ts`'s minute-granularity Hebrew phrasing (`formatRemaining`/`formatStartsIn`) -- this feature's live countdowns need second-precision numeric parts for a ticking display, not a static Hebrew sentence. */
export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Breaks a duration (ms, clamped to >= 0) into whole days/hours/minutes/seconds -- used for the live qualification/planned-range countdowns. */
export function formatDurationParts(totalMs: number): DurationParts {
  const clamped = Math.max(0, Math.floor(totalMs));
  const days = Math.floor(clamped / DAY_MS);
  const hours = Math.floor((clamped % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((clamped % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((clamped % MINUTE_MS) / SECOND_MS);
  return { days, hours, minutes, seconds };
}

/**
 * "01 שעות · 41 דקות · 04 שניות" -- every number carries its own explicit
 * Hebrew unit word, zero-padded. Deliberately NOT a bare "HH:MM:SS" clock
 * string: a standalone zero-padded triplet like "01:41:04" reads as a
 * time-of-day, not a duration, and forces the reader to infer which part is
 * hours/minutes/seconds. This is the ONLY way this feature renders the
 * sub-day portion of a duration -- see `QualificationLiveCard`/
 * `PlannedRangeCountdown`.
 */
export function formatDurationUnitsLabel(parts: DurationParts): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${pad2(parts.hours)} שעות · ${pad2(parts.minutes)} דקות · ${pad2(parts.seconds)} שניות`;
}

/**
 * Fraction of the `[startMs, expiryMs)` qualification window still
 * REMAINING at `nowMs`, clamped to `0..1`. `1` at/before `startMs` (freshly
 * qualified -- nothing elapsed yet), `0` at/after `expiryMs` (including any
 * time after expiry, not just exactly at it). This is deliberately the
 * inverse of elapsed fraction: the progress ring visualizes REMAINING
 * validity, so a mostly-full ring reads naturally as "plenty of time
 * left", matching the large days-remaining number shown next to it (a
 * mostly-EMPTY ring for someone who just qualified would visually
 * contradict that number). Pure presentation math over already-computed
 * instants -- the expiry instant itself is still derived exactly once,
 * server-side, from the qualification's own calendar-month semantics
 * (`lib/domain/shootingRangeQualification.ts`); this never recomputes or
 * duplicates that.
 */
export function computeRemainingProgress(nowMs: number, startMs: number, expiryMs: number): number {
  const totalWindowMs = Math.max(1, expiryMs - startMs);
  return Math.min(1, Math.max(0, (expiryMs - nowMs) / totalWindowMs));
}
