import { Clock } from "lucide-react";
import { LiveClock } from "@/components/ui/LiveClock";

interface LoginClockReadoutProps {
  /** Server-computed "HH:mm:00" for first paint -- same contract as `LiveClock.initialTime`. */
  initialClockTime: string;
  /** "יום שלישי", or null if the Jerusalem date somehow failed to parse. */
  weekdayLabel: string | null;
  dayNumber: number | null;
  /** "באוגוסט", already carrying its own "ב" prefix. */
  monthLabel: string | null;
  /**
   * "panel" -- the horizontal pill this renders as in the desktop text
   * column, alongside the headline/CTA. "stacked" -- the vertical, centered
   * form used inside the decorative ring on mobile, where the ring itself
   * (not a bordered panel) provides the visual container.
   */
  variant: "panel" | "stacked";
  className?: string;
}

/**
 * A live Asia/Jerusalem clock + date, styled to match the login redesign's
 * reference composition. Mounted twice on the page (desktop `panel` inside
 * the text column, mobile `stacked` inside the decorative ring) with
 * responsive visibility classes choosing which one shows -- same
 * mount-twice-toggle-with-CSS convention the rest of this route already
 * uses. Purely presentational: the Jerusalem date/time themselves come
 * from `getJerusalemLocalNow()` server-side (no Google Sheets fetch, no
 * authenticated data).
 */
export function LoginClockReadout({
  initialClockTime,
  weekdayLabel,
  dayNumber,
  monthLabel,
  variant,
  className = "",
}: LoginClockReadoutProps) {
  const iconBadge = (size: string) => (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/15`}>
      <Clock className="h-[45%] w-[45%] text-[#a996ff]" aria-hidden="true" strokeWidth={1.75} />
    </span>
  );

  if (variant === "stacked") {
    return (
      <div className={`flex flex-col items-center gap-2.5 text-center ${className}`}>
        {iconBadge("h-11 w-11")}
        <LiveClock initialTime={initialClockTime} size="hero" className="text-white" />
        {weekdayLabel ? (
          <div className="flex flex-col gap-0.5 text-sm text-white/60">
            <span>{weekdayLabel}</span>
            {dayNumber !== null ? <span className="text-lg font-bold leading-tight text-white">{dayNumber}</span> : null}
            {monthLabel ? <span>{monthLabel}</span> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-4 rounded-2xl bg-white/[0.04] px-6 py-4 ring-1 ring-white/10 xl:gap-6 xl:rounded-3xl xl:px-8 xl:py-6 ${className}`}
    >
      {iconBadge("h-11 w-11 xl:h-14 xl:w-14")}
      <LiveClock initialTime={initialClockTime} size="hero-lg" className="text-white" />
      {weekdayLabel ? (
        <div className="flex flex-col gap-0.5 border-s border-white/10 ps-4 text-sm text-white/60 xl:gap-1 xl:ps-6 xl:text-base">
          <span>{weekdayLabel}</span>
          {dayNumber !== null ? (
            <span className="text-xl font-bold leading-tight text-white xl:text-3xl">{dayNumber}</span>
          ) : null}
          {monthLabel ? <span>{monthLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
