const RHYTHM = ["off", "shift", "shift", "off", "off", "duty", "off", "shift", "off", "duty", "off", "off"] as const;

/** Which bar the pulsing "now" marker sits above -- deliberately one of the "duty" bars, mid-row. */
const NOW_INDEX = 5;

/** Compact (mobile) mode uses a shorter slice of the same rhythm -- same visual language, smaller footprint. */
const COMPACT_RHYTHM = RHYTHM.slice(0, 7);
const COMPACT_NOW_INDEX = 3;

type MarkKind = (typeof RHYTHM)[number];

const MARK_CLASSES: Record<MarkKind, string> = {
  off: "h-2 bg-white/10",
  shift: "h-4 bg-[#8b7bf5]/70",
  duty: "h-3 bg-[#4fc3e8]/70",
};

const COMPACT_MARK_CLASSES: Record<MarkKind, string> = {
  off: "h-1.5 bg-white/10",
  shift: "h-3 bg-[#8b7bf5]/70",
  duty: "h-2.5 bg-[#4fc3e8]/70",
};

const LEGEND: ReadonlyArray<{ label: string; dot: string }> = [
  { label: "משמרת", dot: "bg-[#8b7bf5]" },
  { label: "תורנות", dot: "bg-[#4fc3e8]" },
  { label: "חופש", dot: "bg-white/25" },
];

interface LoginTimelineProps {
  className?: string;
  /**
   * Compact mode (Design Pass PR #22 "immersive composition" pass) -- a
   * shorter bar rhythm with no legend row, for mobile widths where the
   * full legend would add too much height. Same visual language, smaller
   * footprint; never used to show real data either way.
   */
  compact?: boolean;
}

/**
 * Restrained abstract visual language for the login hero -- a rhythm of
 * small bars (never real shift/duty data, just the idea of one) with a
 * slow-pulsing "now" marker. Purely decorative: `aria-hidden` on the whole
 * thing, and every motion class here (`animate-breathe`, `animate-pulse-*`,
 * `animate-login-now-drift`) is disabled under `prefers-reduced-motion` in
 * globals.css, leaving the static bars/legend as a complete illustration on
 * their own.
 */
export function LoginTimeline({ className = "", compact = false }: LoginTimelineProps) {
  const rhythm = compact ? COMPACT_RHYTHM : RHYTHM;
  const nowIndex = compact ? COMPACT_NOW_INDEX : NOW_INDEX;
  const markClasses = compact ? COMPACT_MARK_CLASSES : MARK_CLASSES;

  return (
    <div aria-hidden="true" className={`select-none ${className}`}>
      <div className={`flex items-end gap-[5px] ${compact ? "h-7" : "h-10"}`}>
        {rhythm.map((kind, index) => (
          <span key={index} className="relative flex justify-center">
            <span
              className={`w-1.5 rounded-full ${markClasses[kind]} ${kind === "off" ? "" : "animate-breathe"}`}
              style={kind === "off" ? undefined : { animationDelay: `${index * 0.3}s` }}
            />
            {index === nowIndex ? (
              <span className="absolute -top-3 flex h-3 w-3 items-center justify-center animate-login-now-drift">
                <span className="absolute h-full w-full rounded-full border border-[#8b7bf5]/70 animate-pulse-ring" />
                <span className="relative h-2 w-2 rounded-full bg-[#8b7bf5] shadow-[0_0_10px_2px] shadow-[#8b7bf5]/50 animate-pulse-dot" />
              </span>
            ) : null}
          </span>
        ))}
      </div>

      {compact ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-white/50">
          {LEGEND.map((entry) => (
            <span key={entry.label} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${entry.dot}`} />
              {entry.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8b7bf5]" />
            עכשיו
          </span>
        </div>
      )}
    </div>
  );
}
