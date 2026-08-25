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

/** "HH:MM:SS", zero-padded. */
export function formatClockPart(parts: DurationParts): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`;
}
