import { LoginAuthPanel } from "@/components/login/LoginAuthPanel";
import { LoginVisualPanel } from "@/components/login/LoginVisualPanel";
import { formatHebrewCalendarDate } from "@/lib/presentation/hebrewCalendar";
import { formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
import { formatScheduleMinute } from "@/lib/presentation/scheduleTime";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";

/**
 * Renders a live Asia/Jerusalem clock/date on every request, so it must
 * never be statically optimized at build time (that would freeze "now" at
 * whatever moment `next build` ran). No authenticated data loader is ever
 * reachable from here -- `getJerusalemLocalNow()` only reads the server's
 * own clock, never Google Sheets/Supabase.
 */
export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

/**
 * The app's entry experience (Design Pass PR #22) -- deliberately outside
 * the `(app)` route group, so it never renders Sidebar/BottomNav and is
 * never subject to that group's auth gate (see root layout.tsx). Google
 * OAuth via `GoogleSignInButton` (inside `LoginAuthPanel`) is the only real
 * authentication action; everything else on this page is presentation.
 *
 * `?error=auth` is the existing contract from `/auth/callback` on a failed
 * code exchange -- previously silently dropped, now surfaced as a restrained
 * inline notice rather than nothing.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasAuthError = params.error === "auth";

  const localNow = getJerusalemLocalNow();
  const initialClockTime = `${formatScheduleMinute(localNow.minuteOfDay)}:00`;
  const gregorianDateLabel = formatHebrewWeekdayAndDate(localNow.date);
  const hebrewCalendarLabel = formatHebrewCalendarDate(localNow.date);

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#05070d] lg:flex-row">
      {/* The shared midnight canvas (Design Pass PR #22 "immersive composition"
          pass): below `lg` this is the ONE continuous dark background behind
          both the hero content and the auth card -- LoginAuthPanel has no
          opaque background of its own at that width, so this shows straight
          through with no seam. At `lg`+, LoginAuthPanel reasserts its own
          theme-responsive `bg-surface-3` over the right 38%, covering this
          same layer -- so this only ever has to paint the left/hero side on
          desktop, exactly as before. */}
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

      <LoginVisualPanel
        initialClockTime={initialClockTime}
        gregorianDateLabel={gregorianDateLabel}
        hebrewCalendarLabel={hebrewCalendarLabel}
      />
      <LoginAuthPanel hasAuthError={hasAuthError} />
    </div>
  );
}
