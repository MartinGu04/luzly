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
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <LoginVisualPanel
        initialClockTime={initialClockTime}
        gregorianDateLabel={gregorianDateLabel}
        hebrewCalendarLabel={hebrewCalendarLabel}
      />
      <LoginAuthPanel hasAuthError={hasAuthError} />
    </div>
  );
}
