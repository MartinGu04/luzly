"use client";

import { useEffect, useState } from "react";

const JERUSALEM_TIME_ZONE = "Asia/Jerusalem";

const clockFormatter = new Intl.DateTimeFormat("he-IL", {
  timeZone: JERUSALEM_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface LiveClockProps {
  /**
   * Server-computed "HH:mm:ss" for the very first paint, before hydration
   * takes over -- avoids a hydration flash by rendering the exact same
   * thing the server did. `null` when no server-derived time is available
   * (e.g. a `configuration_error` shell render, which never reaches the
   * point where `localNow` is computed): in that case nothing is rendered
   * until the first client-side tick fires a moment after mount, which is
   * itself hydration-safe -- server and the pre-effect client render both
   * render nothing, so there is nothing for React to flag as a mismatch.
   */
  initialTime: string | null;
  /** "md" (default) is the original prominent dashboard-hero size; "sm" is for a quieter chrome context like `ShellUtilityBar`. */
  size?: "sm" | "md";
  className?: string;
}

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "text-sm font-semibold tracking-wide",
  md: "text-lg font-semibold tracking-wide",
};

/**
 * A small, live Asia/Jerusalem clock -- the app shell's ONE shared clock
 * (Design Pass PR #19; previously dashboard-only). Renders the
 * server-provided time for the first paint when available, then ticks
 * forward every second using the browser's own clock. Purely a
 * presentation-layer live display, not a source of scheduling truth (the
 * read model's `localNow` remains that; no scheduling decision anywhere
 * reads this component's state) and never makes a network request --
 * `setInterval` only ever re-formats the browser's own clock.
 */
export function LiveClock({ initialTime, size = "md", className = "" }: LiveClockProps) {
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    const tick = () => setTime(clockFormatter.format(new Date()));
    tick();
    const interval = setInterval(tick, 1_000);
    return () => clearInterval(interval);
  }, []);

  if (time === null) {
    return null;
  }

  return (
    <time
      dateTime={time}
      className={`font-variant-numeric tabular-nums text-foreground ${SIZE_CLASSES[size]} ${className}`}
    >
      {time}
    </time>
  );
}
