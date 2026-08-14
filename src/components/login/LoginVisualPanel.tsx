import Image from "next/image";
import { LiveClock } from "@/components/ui/LiveClock";
import { LOGIN_HERO_HEADLINE, LOGIN_HERO_SUBTEXT } from "@/lib/config/loginCopy";
import { ORG_LOGO_STRATEGIC_COMMUNICATION, ORG_LOGO_TAKSHAL } from "@/lib/config/brandAssets";
import { LoginBrandLogo } from "./LoginBrandLogo";
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
 * The login route's hero/identity content (Design Pass PR #22, recomposed
 * for "immersive composition" so mobile reads as one continuous canvas
 * rather than a separately-colored hero block). The dark midnight
 * background itself now lives on the shared wrapper in `page.tsx` -- this
 * component only renders content on top of it, using literal white/violet
 * text colors (deliberately not the light/dark tokens in globals.css,
 * since this identity content stays the same regardless of theme in both
 * the desktop split and the mobile continuous canvas).
 *
 * Renders no authenticated data: the clock/date props are pure Asia/
 * Jerusalem presentation derived server-side from `getJerusalemLocalNow()`
 * (no Google Sheets fetch), and the timeline below is decorative-only.
 */
export function LoginVisualPanel({ initialClockTime, gregorianDateLabel, hebrewCalendarLabel }: LoginVisualPanelProps) {
  return (
    <section className="relative flex flex-col px-6 pt-5 sm:px-10 sm:pt-6 lg:min-h-dvh lg:w-[62%] lg:justify-between lg:px-16 lg:pt-10">
      <div className="relative flex items-center justify-end gap-3">
        <LoginLogoRow
          primary={
            // תקש"ל's circular patch sits on a taller canvas with more
            // transparent padding above/below it than the strategic-comm
            // patch does -- at an equal CSS height the patch itself would
            // visibly read smaller, so this gets a taller container to
            // compensate and land at the same optical size (see the two
            // `alt`-matched images below).
            <Image
              src={ORG_LOGO_TAKSHAL.src}
              alt={ORG_LOGO_TAKSHAL.alt}
              width={ORG_LOGO_TAKSHAL.width}
              height={ORG_LOGO_TAKSHAL.height}
              className="h-[52px] w-auto object-contain lg:h-[78px]"
            />
          }
          secondary={
            <Image
              src={ORG_LOGO_STRATEGIC_COMMUNICATION.src}
              alt={ORG_LOGO_STRATEGIC_COMMUNICATION.alt}
              width={ORG_LOGO_STRATEGIC_COMMUNICATION.width}
              height={ORG_LOGO_STRATEGIC_COMMUNICATION.height}
              className="h-10 w-auto object-contain lg:h-[60px]"
            />
          }
        />
      </div>

      <div className="relative flex flex-col gap-4 py-5 sm:gap-6 sm:py-6 lg:flex-1 lg:justify-center lg:py-0">
        <div className="max-w-md">
          <LoginBrandLogo />
          <h1 className="mt-5 text-[clamp(1.5rem,4.2vw,2.75rem)] leading-[1.15] font-bold text-white sm:mt-6 lg:mt-7">
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

        <LoginTimeline className="lg:hidden" compact />
      </div>

      <div className="relative hidden pb-8 lg:block lg:pb-12">
        <LoginTimeline />
      </div>
    </section>
  );
}
