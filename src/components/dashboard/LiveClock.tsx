"use client";

import { useEffect, useState } from "react";

const JERUSALEM_TIME_ZONE = "Asia/Jerusalem";

const clockFormatter = new Intl.DateTimeFormat("he-IL", {
  timeZone: JERUSALEM_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface LiveClockProps {
  /** Server-computed "HH:mm" for the very first paint, before hydration takes over. */
  initialTime: string;
  className?: string;
}

/**
 * A small, live Asia/Jerusalem clock. Renders the server-provided time for
 * the first paint (avoiding a hydration flash), then ticks forward using
 * the browser's own clock -- purely a presentation-layer live display, not
 * a source of scheduling truth (the read model's `localNow` remains that).
 */
export function LiveClock({ initialTime, className = "" }: LiveClockProps) {
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    const tick = () => setTime(clockFormatter.format(new Date()));
    tick();
    const interval = setInterval(tick, 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <time
      dateTime={time}
      className={`font-variant-numeric tabular-nums text-lg font-semibold tracking-wide text-foreground ${className}`}
    >
      {time}
    </time>
  );
}
