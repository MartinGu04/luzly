import { LiveClock } from "@/components/ui/LiveClock";
import { LOGIN_HERO_HEADLINE, LOGIN_HERO_SUBTEXT } from "@/lib/config/loginCopy";
import { LoginLogoRow } from "./LoginLogoRow";
import { LoginTimeline } from "./LoginTimeline";

interface LoginVisualPanelProps {
  /** Server-computed "HH:mm:00" for first paint -- same contract as `LiveClock.initialTime`. */
  initialClockTime: string;
  /** "יום שישי · 14 באוגוסט", or null if the Jerusalem date somehow failed to parse. */
  gregorianDateLabel: string | null;
  /** "כ״א באב תשפ״ו", or null -- shown as restrained secondary context under the Gregorian date. */
  hebrewCalendarLabel: string | null;
}

/**
 * The login route's visual-identity side (Design Pass PR #22) -- always
 * dark/midnight regardless of the active app theme, so its palette is
 * intentionally literal rather than read from the light/dark tokens in
 * globals.css (it deliberately does NOT follow `--background`/`--primary`
 * etc.). The exact hex values below mirror the dark theme's own
 * `--background`/`--background-glow-a`/`--background-glow-b`/`--primary`/
 * `--accent` (see globals.css) purely for palette consistency, not because
 * this panel reads those tokens.
 *
 * Renders no authenticated data: the clock/date props are pure Asia/
 * Jerusalem presentation derived server-side from `getJerusalemLocalNow()`
 * (no Google Sheets fetch), and the timeline below is decorative-only.
 */
export function LoginVisualPanel({ initialClockTime, gregorianDateLabel, hebrewCalendarLabel }: LoginVisualPanelProps) {
  return (
    <section className="relative isolate flex min-h-[34dvh] flex-col justify-between overflow-hidden bg-[#05070d] lg:min-h-dvh lg:w-[62%]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -start-20 h-[26rem] w-[26rem] rounded-full bg-[#241a45]/50 blur-3xl animate-ambient-glow" />
        <div
          className="absolute -bottom-28 -end-16 h-[24rem] w-[24rem] rounded-full bg-[#0d2233]/60 blur-3xl animate-ambient-glow"
          style={{ animationDelay: "2.5s" }}
        />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, white 1px, transparent 1px), linear-gradient(to right, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(80% 55% at 50% 25%, black, transparent 85%)",
          }}
        />
      </div>

      <div className="relative flex items-center px-6 pt-5 sm:px-10 sm:pt-6 lg:px-16 lg:pt-10">
        <LoginLogoRow />
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-4 px-6 py-5 sm:gap-6 sm:px-10 sm:py-6 lg:px-16">
        <div className="max-w-md">
          <h1 className="text-[clamp(1.5rem,4.2vw,2.75rem)] leading-[1.15] font-bold text-white">
            {LOGIN_HERO_HEADLINE}
          </h1>
          <p className="mt-3 hidden max-w-sm text-[15px] leading-relaxed text-white/60 sm:block">{LOGIN_HERO_SUBTEXT}</p>
        </div>

        <div>
          <LiveClock initialTime={initialClockTime} size="hero" className="text-white" />
          {gregorianDateLabel ? (
            <div className="mt-2 flex flex-col gap-0.5 text-sm text-white/60 sm:mt-3">
              <span>{gregorianDateLabel}</span>
              {hebrewCalendarLabel ? (
                <span className="hidden text-xs text-white/35 sm:block">{hebrewCalendarLabel}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative hidden px-6 pb-8 sm:px-10 lg:block lg:px-16 lg:pb-12">
        <LoginTimeline />
      </div>
    </section>
  );
}
