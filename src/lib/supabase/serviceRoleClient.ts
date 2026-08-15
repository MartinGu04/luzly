import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabasePublicConfig } from "./config";

/** Thrown when the service-role key is missing or invalid. */
export class SupabaseServiceRoleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseServiceRoleConfigError";
  }
}

/**
 * The ONE Supabase client in this codebase that bypasses Row Level
 * Security -- see the migration comment in
 * `supabase/migrations/20260815130000_create_notification_engine.sql`
 * for why the notification worker genuinely needs this (no logged-in
 * user/session exists in a Cron-triggered request, so there is no
 * `auth.uid()` for an RLS-scoped client to key off).
 *
 * `import "server-only"` and never a module-level singleton, matching
 * `lib/supabase/server.ts`'s own convention -- a fresh client per call,
 * so nothing about it can be cached/reused in a way that outlives one
 * request.
 *
 * MUST NEVER be imported from:
 *  - any "use client" component
 *  - any Server Component/Action reachable from ordinary user navigation
 *  - the Service Worker
 * It exists solely for `src/app/internal/notifications/tick/route.ts`
 * and the engine modules it calls, all of which are themselves gated by
 * `NOTIFICATION_WORKER_SECRET` before this is ever touched -- see
 * `src/lib/notifications/workerAuth.ts`. A regression guard
 * (`serviceRoleBoundary.test.ts`) enforces this file's import sites stay
 * exactly that short list.
 *
 * `autoRefreshToken`/`persistSession`/`detectSessionInUrl` are all
 * disabled: this client is never used as an end-user session client, so
 * none of the browser-session machinery `@supabase/ssr` normally
 * provides is relevant or safe to enable here.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  const { url } = readSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey || serviceRoleKey.trim() === "") {
    throw new SupabaseServiceRoleConfigError("Missing Supabase configuration: SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
