import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppRevalidator } from "@/components/layout/AppRevalidator";
import { AppShell } from "@/components/layout/AppShell";
import { AccessDeniedScreen } from "@/components/auth/AccessDeniedScreen";
import { SearchPaletteProvider } from "@/components/search/SearchPaletteProvider";
import { resolveOperationalMode } from "@/lib/emergencyMode/state";
import { getRequestPersonalSchedule } from "@/lib/readModels/getRequestPersonalSchedule";
import { getRequestSearchReadModel } from "@/lib/readModels/getRequestSearchReadModel";
import { formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
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
 *
 * `AppRevalidator` (PR #34) is mounted here as a sibling of `AppShell`,
 * the same way `ServiceWorkerManager` sits beside `{children}` in the root
 * layout -- present on every authenticated page, absent from the
 * `AccessDeniedScreen` branch (nothing to keep fresh for a denied user).
 *
 * `SearchPaletteProvider` (PR #35) wraps `AppShell` so trigger buttons deep
 * inside it (`Sidebar`, `MobileIdentityBar`) share one palette instance via
 * context. Its `searchReadModel` comes from a SEPARATE `getRequestSearchReadModel()`
 * call, independently re-verifying identity/config rather than threading
 * `result`'s already-narrowed personal read model through -- the same
 * "re-verify, don't thread raw data across read-model boundaries" pattern
 * `loadScheduleReadModel`'s manager branch already uses. `null` (only on
 * `configuration_error`) makes the whole feature quietly unavailable.
 *
 * These loaders (PR #38, plus Emergency Mode's `resolveOperationalMode()`)
 * run CONCURRENTLY via `Promise.all` rather than one `await` after the
 * other -- they have no data dependency on each other (the search read
 * model independently re-resolves identity and its own workbook read, see
 * `loadSearchReadModel`; `resolveOperationalMode()` is a small, request-
 * scoped `cache()`-memoized DB read of its own, see
 * `lib/emergencyMode/state.ts`), so awaiting them sequentially was pure
 * unnecessary latency on every single navigation into this route group,
 * gating this whole shell's render (including the persistent Sidebar)
 * behind the sum of all calls instead of the slowest one. This never
 * changes what any call does or how its result is used below -- only when
 * the others start.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const [result, searchResult, operationalMode] = await Promise.all([
    getRequestPersonalSchedule(),
    getRequestSearchReadModel(),
    resolveOperationalMode(),
  ]);

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
  // `avatarUrl` is a sibling of `person`/`model` on both remaining statuses
  // (see PersonalScheduleLoadResult) -- presentation-only, sourced from the
  // Supabase auth identity, never כ"א/Person, never affecting who this is.
  const avatarUrl = result.avatarUrl;
  // Same auth-only sibling as `avatarUrl` -- threaded down only as far as
  // `usePushSubscription` needs it (per-user/per-device Push preference
  // key), never folded into personnel/domain identity.
  const userId = result.userId;

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
  // Same "ok"-only availability as initialClockTime above -- the SAME
  // already-resolved localNow, just the date half of it, formatted once
  // here (server) rather than passed raw for a client component to format.
  const dateLabel = result.status === "ok" ? formatHebrewWeekdayAndDate(result.model.localNow.date) : null;

  const searchReadModel = searchResult.status === "ok" ? searchResult.model : null;

  return (
    <>
      <AppRevalidator />
      <SearchPaletteProvider searchReadModel={searchReadModel}>
        <AppShell
          person={{ name: person.name, isManager: person.isManager, avatarUrl, userId }}
          initialClockTime={initialClockTime}
          dateLabel={dateLabel}
          emergencyModeActive={operationalMode.kind === "emergency"}
        >
          {children}
        </AppShell>
      </SearchPaletteProvider>
    </>
  );
}
