import "client-only";
import { createBrowserClient } from "@supabase/ssr";
import { readSupabasePublicConfig } from "./config";

/**
 * A browser-only Supabase client (for initiating the Google OAuth
 * redirect from the login screen). Client-safe only — the `client-only`
 * import makes an accidental server-side import of this module fail the
 * build instead of silently working.
 */
export function createSupabaseBrowserClient() {
  const config = readSupabasePublicConfig();
  return createBrowserClient(config.url, config.anonKey);
}
