import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AccessDeniedScreen } from "@/components/auth/AccessDeniedScreen";
import { getRequestPersonalSchedule } from "@/lib/readModels/getRequestPersonalSchedule";
import { formatScheduleMinute } from "@/lib/presentation/scheduleTime";

/**
 * Every route here resolves a specific authenticated user's identity, so
 * it must never be statically generated/cached at build or request time —
 * that's exactly the kind of caching that could leak one user's resolved
 * identity to another. This also means `next build` never has to reach
 * live Supabase/Google config while prerendering this route.
 */
export const dynamic = "force-dynamic";

/**
 * Protects every route under this group server-side, using the SAME
 * request-scoped `getRequestPersonalSchedule()` call the dashboard page
 * itself uses. React's `cache()` (inside that helper) deduplicates the two
 * calls within one request, so a normal render performs exactly one
 * Google workbook batch fetch — never a separate identity fetch followed
 * by a second content fetch.
 *
 * Only a genuinely unauthenticated visitor is redirected to /login (no
 * client useEffect redirect, no flash of protected content). Every other
 * non-"ok"/non-"configuration_error" state is an authenticated user still
 * denied access — no usable email, an email absent from כ"א, or an email
 * matching more than one כ"א record — and none of those are redirected
 * back into the login flow (that would loop); they all get the same
 * generic denial screen instead of app content, revealing no personnel
 * names, emails, or workbook details either way.
 *
 * `configuration_error` is different: the identity itself resolved fine,
 * only the shift-schedule configuration is broken, so this authorized
 * person still gets the real app shell (sidebar/identity) -- the dashboard
 * page itself renders the polished "can't compute shift hours" state in
 * its content area.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const result = await getRequestPersonalSchedule();

  if (result.status === "unauthenticated") {
    redirect("/login");
  }

  if (
    result.status === "missing_email" ||
    result.status === "unmapped" ||
    result.status === "ambiguous_identity"
  ) {
    return <AccessDeniedScreen />;
  }

  const person = result.status === "ok" ? result.model.person : result.person;

  // The app shell's ONE live clock (`ShellUtilityBar`) needs a server-
  // computed "HH:mm:ss" for its first paint, same as the old dashboard-only
  // clock used to. Only the "ok" status ever computed a `localNow` (a
  // `configuration_error` returns before that point) -- reusing
  // `result.model.localNow` here costs no extra Google fetch or personal-
  // loader call, it's the SAME already-resolved `result` from the one
  // `getRequestPersonalSchedule()` call above. `configuration_error` passes
  // `null` and `AppShell`/`LiveClock` handle that gracefully (no clock
  // until the client's own first tick, never a `Date.now()` guess here).
  const initialClockTime =
    result.status === "ok" ? `${formatScheduleMinute(result.model.localNow.minuteOfDay)}:00` : null;

  return (
    <AppShell person={{ name: person.name, isManager: person.isManager }} initialClockTime={initialClockTime}>
      {children}
    </AppShell>
  );
}
