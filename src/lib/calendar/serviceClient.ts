import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRoleClient";

/**
 * The ONE call site for the personal-calendar-feed route's privileged
 * (RLS-bypassing) Supabase access -- the SECOND legitimate call site of
 * `createSupabaseServiceRoleClient` in this codebase, alongside the
 * notification worker's own `lib/notifications/engine/serviceClient.ts`.
 *
 * `GET /calendar/<token>.ics` (`src/app/calendar/[token]/route.ts`) is
 * reached by external calendar clients that never carry a Supabase
 * session -- only the bare `token` from the URL -- so it has no
 * `auth.uid()` for an RLS-scoped client to key off, exactly the same
 * structural reason the Cron-triggered worker needs it. Every other
 * calendar-feed module (`feedStore.ts` -- enable/reset/disable, run from
 * the feed owner's own authenticated session) uses the normal RLS-scoped
 * client instead; only the token-authenticated lookup needs this.
 *
 * Kept to this one function (never imported directly elsewhere) so the
 * regression guard (`src/app/notificationServiceRoleBoundary.test.ts`)
 * stays a short, exact allowlist of every file in the codebase allowed to
 * reference the service-role client at all.
 */
export function getCalendarFeedServiceClient() {
  return createSupabaseServiceRoleClient();
}
