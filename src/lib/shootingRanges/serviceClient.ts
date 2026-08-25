import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRoleClient";

/**
 * The ONE call site for the מטווחים (shooting-range qualification)
 * feature's privileged (RLS-bypassing) Supabase access -- the SIXTH
 * legitimate call site of `createSupabaseServiceRoleClient` in this
 * codebase, alongside the notification worker's own
 * `lib/notifications/engine/serviceClient.ts`, the personal calendar
 * feed's `lib/calendar/serviceClient.ts`, the personal Home visit recap's
 * `lib/dashboardVisit/serviceClient.ts`, and Report 1's own
 * `lib/reportOne/serviceClient.ts`.
 *
 * `shooting_range_completions` and `shooting_range_planned_occurrences`
 * both have zero RLS policies (default-deny), same posture as those
 * tables -- every read/write goes through `lib/shootingRanges/store.ts`,
 * and every write path in `lib/shootingRanges/actions.ts` always
 * re-derives the caller's identity/authorization server-side first (never
 * a client-supplied identity), and re-validates any target person id
 * against a freshly-fetched roster before writing anything.
 *
 * A separate call site (rather than reusing an existing domain's) to keep
 * this feature's storage its own clean, independent boundary, matching the
 * convention `reportOne`/`dashboardVisit`/`calendar` already set.
 *
 * Kept to this one function (never imported directly elsewhere) so the
 * regression guard (`src/app/notificationServiceRoleBoundary.test.ts`)
 * stays a short, exact allowlist of every file in the codebase allowed to
 * reference the service-role client at all.
 */
export function getShootingRangesServiceClient() {
  return createSupabaseServiceRoleClient();
}
