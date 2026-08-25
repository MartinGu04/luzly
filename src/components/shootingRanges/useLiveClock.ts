import { useEffect, useState } from "react";

const NORMAL_TICK_MS = 1000;
/** Under `prefers-reduced-motion`, the numbers still advance (never frozen/stale) but far less often -- "tasteful, no excessive flashing" per the spec, while staying honest about elapsed/remaining time. */
const REDUCED_MOTION_TICK_MS = 30_000;

/**
 * `null` until the first effect runs, then the current wall-clock time in
 * ms, refreshed on an interval. Deliberately `null` (never `Date.now()`)
 * on the very first render -- that first render happens identically during
 * SSR and client hydration (neither ever calls `Date.now()`), so a caller
 * that renders a fixed placeholder while this is `null` can never hit a
 * hydration mismatch. Every live countdown in the מטווחים feature
 * (`QualificationLiveCard`, `PlannedRangeCountdown`) shares this ONE
 * ticking mechanism rather than each running its own `setInterval`.
 */
export function useLiveClock(): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tick = () => setNowMs(Date.now());
    tick();
    const interval = setInterval(tick, prefersReducedMotion ? REDUCED_MOTION_TICK_MS : NORMAL_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  return nowMs;
}
