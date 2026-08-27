import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRoleClient";

/**
 * The ONE call site for the system-level Emergency Mode feature's
 * privileged (RLS-bypassing) Supabase access -- the SEVENTH legitimate
 * call site of `createSupabaseServiceRoleClient` in this codebase,
 * alongside the notification worker's own
 * `lib/notifications/engine/serviceClient.ts`, the personal calendar
 * feed's `lib/calendar/serviceClient.ts`, the personal Home visit
 * recap's `lib/dashboardVisit/serviceClient.ts`, Report 1's own
 * `lib/reportOne/serviceClient.ts`, and the מטווחים feature's
 * `lib/shootingRanges/serviceClient.ts`.
 *
 * `emergency_mode_periods`/`emergency_mode_state` both have zero RLS
 * policies (default-deny) -- every read/write goes through
 * `lib/emergencyMode/store.ts`, and every write path in
 * `lib/emergencyMode/actions.ts` always re-derives the caller's
 * identity/manager authorization server-side (never a client-supplied
 * identity or `isManager` flag).
 *
 * A separate call site (rather than reusing an existing domain's) to
 * keep this feature's storage its own clean, independent boundary,
 * matching the convention every other domain above already set.
 *
 * Kept to this one function (never imported directly elsewhere) so the
 * regression guard (`src/app/notificationServiceRoleBoundary.test.ts`)
 * stays a short, exact allowlist of every file in the codebase allowed
 * to reference the service-role client at all.
 */
export function getEmergencyModeServiceClient() {
  return createSupabaseServiceRoleClient();
}
