import "server-only";

/**
 * Timing-only diagnostics for profiling the authenticated-navigation data
 * path (identity resolution, Google Sheets fetch, parsing, read-model
 * construction) -- added to actually MEASURE where server-side navigation
 * latency goes, rather than guessing before introducing caching.
 *
 * Deliberately logs a label and a duration in milliseconds, and NOTHING
 * else -- never a spreadsheet cell value, a person's name/email, a token,
 * or service-account/credential material. `label` is always a short,
 * static, developer-chosen string at each call site (see usages), never
 * built from request/user data, so it can never leak anything either.
 *
 * Active in development by default; production stays silent unless
 * `ENABLE_TIMING_DIAGNOSTICS=1` is explicitly set, so this never becomes
 * noisy production logging by accident. Also silent under the test runner
 * (`VITEST=true`) -- this is a runtime profiling aid, not something any
 * test should assert on or have its output cluttered by.
 */
const TIMING_DIAGNOSTICS_ENABLED =
  process.env.VITEST !== "true" &&
  (process.env.NODE_ENV !== "production" || process.env.ENABLE_TIMING_DIAGNOSTICS === "1");

/**
 * Times an async `fn`, logging `"[timing] <label>: <ms>ms"` on completion
 * (success or failure alike -- a failing stage's duration is still useful
 * profiling signal). A no-op passthrough when diagnostics are disabled, so
 * there is zero overhead in the default production path beyond the one
 * boolean check.
 */
export async function timedStage<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!TIMING_DIAGNOSTICS_ENABLED) return fn();

  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    console.log(`[timing] ${label}: ${durationMs}ms`);
  }
}

/**
 * Same as `timedStage`, for a synchronous `fn` (e.g. pure in-memory
 * parsing) -- kept as its own function rather than always awaiting
 * `timedStage` so a sync stage never pays even a microtask tick of
 * overhead when diagnostics are disabled.
 */
export function timedSyncStage<T>(label: string, fn: () => T): T {
  if (!TIMING_DIAGNOSTICS_ENABLED) return fn();

  const startedAt = performance.now();
  try {
    return fn();
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    console.log(`[timing] ${label}: ${durationMs}ms`);
  }
}
