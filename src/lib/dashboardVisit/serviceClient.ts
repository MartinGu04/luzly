import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRoleClient";

/**
 * The ONE call site for the personal Home "since your previous visit"
 * recap's privileged (RLS-bypassing) Supabase access -- the THIRD
 * legitimate call site of `createSupabaseServiceRoleClient` in this
 * codebase, alongside the notification worker's own
 * `lib/notifications/engine/serviceClient.ts` and the personal calendar
 * feed's `lib/calendar/serviceClient.ts`.
 *
 * `dashboard_visit_state` has zero RLS policies (default-deny), same
 * posture as `notification_inbox_state` -- every read/write goes through
 * `lib/dashboardVisit/store.ts`, which always re-derives the
 * authenticated user server-side first (never a client-supplied user
 * id). This is a SEPARATE call site from the notification engine's own
 * (rather than reusing `getNotificationServiceClient`) to keep this
 * feature's storage a clean, independent domain boundary -- visiting
 * Home is not a notification-engine concept, even though it reads the
 * SAME `notification_jobs` outbox for its actual recap content (via
 * `lib/notifications/engine/store.ts`, unchanged).
 *
 * Kept to this one function (never imported directly elsewhere) so the
 * regression guard (`src/app/notificationServiceRoleBoundary.test.ts`)
 * stays a short, exact allowlist of every file in the codebase allowed to
 * reference the service-role client at all.
 */
export function getDashboardVisitServiceClient() {
  return createSupabaseServiceRoleClient();
}
