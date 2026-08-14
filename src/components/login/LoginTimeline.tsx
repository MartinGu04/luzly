const RHYTHM = ["off", "shift", "shift", "off", "off", "duty", "off", "shift", "off", "duty", "off", "off"] as const;

/** Which bar the pulsing "now" marker sits above -- deliberately one of the "duty" bars, mid-row. */
const NOW_INDEX = 5;

type MarkKind = (typeof RHYTHM)[number];

const MARK_CLASSES: Record<MarkKind, string> = {
  off: "h-2 bg-white/10",
  shift: "h-4 bg-[#8b7bf5]/70",
  duty: "h-3 bg-[#4fc3e8]/70",
};

const LEGEND: ReadonlyArray<{ label: string; dot: string }> = [
  { label: "משמרת", dot: "bg-[#8b7bf5]" },
  { label: "תורנות", dot: "bg-[#4fc3e8]" },
  { label: "חופש", dot: "bg-white/25" },
];

/**
 * Restrained abstract visual language for the login hero -- a rhythm of
 * small bars (never real shift/duty data, just the idea of one) with a
 * slow-pulsing "now" marker. Purely decorative: `aria-hidden` on the whole
 * thing, and every motion class here (`animate-breathe`, `animate-pulse-*`,
 * `animate-login-now-drift`) is disabled under `prefers-reduced-motion` in
 * globals.css, leaving the static bars/legend as a complete illustration on
 * their own.
 */
export function LoginTimeline({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`select-none ${className}`}>
      <div className="flex h-10 items-end gap-[5px]">
        {RHYTHM.map((kind, index) => (
          <span key={index} className="relative flex justify-center">
            <span
              className={`w-1.5 rounded-full ${MARK_CLASSES[kind]} ${kind === "off" ? "" : "animate-breathe"}`}
              style={kind === "off" ? undefined : { animationDelay: `${index * 0.3}s` }}
            />
            {index === NOW_INDEX ? (
              <span className="absolute -top-3 flex h-3 w-3 items-center justify-center animate-login-now-drift">
                <span className="absolute h-full w-full rounded-full border border-[#8b7bf5]/70 animate-pulse-ring" />
                <span className="relative h-2 w-2 rounded-full bg-[#8b7bf5] shadow-[0_0_10px_2px] shadow-[#8b7bf5]/50 animate-pulse-dot" />
              </span>
            ) : null}
          </span>
        ))}
      </div>

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
    </div>
  );
}
