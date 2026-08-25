import { useEffect, useState } from "react";

const TICK_MS = 1000;

/**
 * `null` until the first effect runs, then the current wall-clock time in
 * ms, refreshed on an interval. Deliberately `null` (never `Date.now()`)
 * on the very first render -- that first render happens identically during
 * SSR and client hydration (neither ever calls `Date.now()`), so a caller
 * that renders a fixed placeholder while this is `null` can never hit a
 * hydration mismatch. Every live countdown in the מטווחים feature
 * (`QualificationLiveCard`, `PlannedRangeCountdown`) shares this ONE
 * ticking mechanism rather than each running its own `setInterval`.
 *
 * Always ticks every second, REGARDLESS of `prefers-reduced-motion` -- this
 * is a numeric clock that displays seconds; reduced motion is about
 * decorative animation (the progress ring's sweep transition, pulse/glow
 * effects), never about time accuracy. Consumers reduce/remove their own
 * DECORATIVE motion via the existing shared CSS pattern instead
 * (`motion-reduce:` Tailwind utilities / the global
 * `@media (prefers-reduced-motion: reduce)` block in `globals.css`, e.g.
 * `ProgressRing`'s `motion-reduce:transition-none` and
 * `PulseIndicator`'s `animate-pulse-*` classes) -- there is no reduced-
 * motion branching here at all.
 *
 * Every value returned is read directly from `Date.now()` at tick time,
 * never derived by decrementing a previously stored value -- this is what
 * prevents accumulated drift if the browser throttles/delays timers (e.g. a
 * backgrounded tab). Also resyncs immediately on `visibilitychange` back to
 * `"visible"`, so returning from a backgrounded tab (where `setInterval` is
 * commonly throttled to well under once per second) shows the correct time
 * at once rather than waiting for the next throttled tick or requiring a
 * page refresh.
 */
export function useLiveClock(): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const interval = setInterval(tick, TICK_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return nowMs;
}
