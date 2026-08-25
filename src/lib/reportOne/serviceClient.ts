import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRoleClient";

/**
 * The ONE call site for "דוח 1 למחר"'s reserve-inclusion-toggle
 * privileged (RLS-bypassing) Supabase access -- the FOURTH legitimate
 * call site of `createSupabaseServiceRoleClient` in this codebase,
 * alongside the notification worker's own
 * `lib/notifications/engine/serviceClient.ts`, the personal calendar
 * feed's `lib/calendar/serviceClient.ts`, and the personal Home visit
 * recap's `lib/dashboardVisit/serviceClient.ts`.
 *
 * `report_one_reserve_inclusion` has zero RLS policies (default-deny),
 * same posture as those tables -- every read/write goes through
 * `lib/reportOne/store.ts`, and the one write path
 * (`setReserveInclusionPreferenceAction`) always re-derives manager
 * authorization server-side first (never a client-supplied identity).
 * This is a SEPARATE call site (rather than reusing
 * `getNotificationServiceClient`/`getDashboardVisitServiceClient`) to
 * keep this feature's storage its own clean, independent domain
 * boundary, matching the convention those two already set.
 *
 * Kept to this one function (never imported directly elsewhere) so the
 * regression guard (`src/app/notificationServiceRoleBoundary.test.ts`)
 * stays a short, exact allowlist of every file in the codebase allowed
 * to reference the service-role client at all.
 */
export function getReportOneReserveInclusionServiceClient() {
  return createSupabaseServiceRoleClient();
}
