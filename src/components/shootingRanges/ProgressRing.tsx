interface ProgressRingProps {
  /** 0..1, clamped -- fraction of the ring's window this arc visualizes (callers decide what that fraction means, e.g. remaining vs. elapsed). */
  progress: number;
  /** Tailwind text-color utility class driving the ring's stroke (e.g. "text-success") -- matches the same semantic tone as the status badge next to it. */
  toneClassName: string;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
  /**
   * Renders a small pulsing dot at the endpoint of the visible arc, in the
   * SAME color as the ring itself -- a subtle "this value is live" cue,
   * meant to replace a separate/disconnected pulse indicator placed
   * elsewhere in a caller's own UI. Its position is derived from the exact
   * same `progress` fraction that draws the arc (never a separately
   * animated position) -- over a long window (e.g. a six-month
   * qualification) the true angular movement second-to-second is naturally
   * almost imperceptible, which is correct: a numeric countdown elsewhere
   * is what should demonstrate live per-second ticking, not this marker.
   * Never rendered when `progress` is exactly 0 (there's nothing
   * meaningful to mark at the arc's own empty starting point). Reuses the
   * existing shared `animate-pulse-dot` keyframe (see `PulseIndicator`),
   * already globally disabled under `prefers-reduced-motion: reduce` in
   * `globals.css` -- no separate reduced-motion handling needed here.
   * Pass this only once a live clock value is actually driving `progress`,
   * never during a pre-hydration static render (keeps the marker itself
   * from ever being a source of a hydration mismatch).
   */
  showLiveMarker?: boolean;
}

/**
 * A circular progress ring, pure SVG -- no charting/animation library. The
 * stroke's `currentColor` is driven by `toneClassName` so it always matches
 * the qualification status badge's own semantic color. The one CSS
 * transition (`transition-[stroke-dashoffset]`) animates smoothly between
 * ticks without a JS animation loop, and is dropped entirely under
 * `prefers-reduced-motion: reduce` via the `motion-reduce:transition-none`
 * utility -- the ring still reflects the current value immediately, it
 * simply stops visually sweeping between updates.
 */
export function ProgressRing({
  progress,
  toneClassName,
  size = 176,
  strokeWidth = 10,
  children,
  showLiveMarker = false,
}: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped);

  // The arc is drawn starting at the circle's own local angle 0 (before the
  // whole `<svg>` below is rotated -90deg to make that visual start point
  // the top of the ring) and sweeps through `clamped` of a full turn. The
  // marker sits at that same local angle so it lands exactly on the arc's
  // endpoint once the shared `-rotate-90` is applied to both.
  const markerAngle = clamped * 2 * Math.PI;
  const markerRadius = strokeWidth * 0.6;
  const markerX = center + radius * Math.cos(markerAngle);
  const markerY = center + radius * Math.sin(markerAngle);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-border" />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={`motion-reduce:transition-none transition-[stroke-dashoffset] duration-1000 ease-linear ${toneClassName}`}
          stroke="currentColor"
        />
        {showLiveMarker && clamped > 0 ? (
          <circle
            data-testid="progress-ring-live-marker"
            cx={markerX}
            cy={markerY}
            r={markerRadius}
            fill="currentColor"
            className={`animate-pulse-dot ${toneClassName}`}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
