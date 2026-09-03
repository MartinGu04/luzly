import { useEffect, useState } from "react";

const TICK_MS = 1000;

/**
 * `null` until the first effect runs, then the current wall-clock time in
 * ms, refreshed every second. Deliberately `null` (never `Date.now()`) on
 * the very first render -- that render happens identically during SSR and
 * client hydration, so rendering a fixed placeholder while this is `null`
 * can never hit a hydration mismatch (same pattern as the מטווחים feature's
 * own `useLiveClock`, duplicated here rather than imported so this page
 * stays a self-contained feature).
 *
 * Resyncs immediately on `visibilitychange` back to `"visible"`, so
 * returning to a backgrounded tab (where `setInterval` is commonly
 * throttled) shows the correct countdown at once instead of waiting for a
 * throttled tick.
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
