interface PulseIndicatorProps {
  tone?: "primary" | "critical";
  className?: string;
}

/**
 * The small "live" operational indicator: a solid dot, a soft expanding
 * ring, and a faint glow -- layered, restrained, never a flashing whole
 * card. Pure CSS keyframes (see globals.css), automatically disabled under
 * `prefers-reduced-motion`. Always paired with visible text elsewhere
 * (e.g. "פעיל עכשיו") -- motion is never the only state indicator.
 */
export function PulseIndicator({ tone = "primary", className = "" }: PulseIndicatorProps) {
  const color = tone === "critical" ? "bg-critical" : "bg-primary";
  const ring = tone === "critical" ? "border-critical" : "border-primary";

  return (
    <span className={`relative inline-flex h-2.5 w-2.5 items-center justify-center ${className}`} aria-hidden="true">
      <span className={`absolute h-full w-full rounded-full border ${ring} animate-pulse-ring`} />
      <span className={`relative h-2 w-2 rounded-full ${color} animate-pulse-dot shadow-[0_0_10px_2px] shadow-current`} />
    </span>
  );
}
