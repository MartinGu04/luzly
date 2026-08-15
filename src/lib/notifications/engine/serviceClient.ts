import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRoleClient";

/**
 * The ONE call site for the notification engine's privileged (RLS-
 * bypassing) Supabase access. Every other engine module imports
 * `getNotificationServiceClient` from here instead of
 * `createSupabaseServiceRoleClient` directly -- this keeps the
 * regression guard (`src/app/notificationServiceRoleBoundary.test.ts`)
 * to a short, exact allowlist of the only two files in the whole
 * codebase allowed to reference the service-role client at all.
 */
export function getNotificationServiceClient() {
  return createSupabaseServiceRoleClient();
}
