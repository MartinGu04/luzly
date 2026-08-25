interface ProgressRingProps {
  /** 0..1, clamped -- fraction of the six-month window elapsed (or, past expiry, held at 1). */
  progress: number;
  /** Tailwind text-color utility class driving the ring's stroke (e.g. "text-success") -- matches the same semantic tone as the status badge next to it. */
  toneClassName: string;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
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
export function ProgressRing({ progress, toneClassName, size = 176, strokeWidth = 10, children }: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-border" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={`motion-reduce:transition-none transition-[stroke-dashoffset] duration-1000 ease-linear ${toneClassName}`}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
