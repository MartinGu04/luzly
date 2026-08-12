import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabasePublicConfig } from "./config";

/**
 * A fresh, request-bound, cookie-aware Supabase server client. Server
 * only. Deliberately NOT a module-level singleton: it is a function that
 * must be called per request, so a client (and the session/identity it
 * resolves) can never be reused or leak across requests or users.
 */
export async function createSupabaseServerClient() {
  const config = readSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, which can't set
          // cookies (there's no outgoing response to attach them to).
          // Harmless here: this app has no middleware relying on a
          // proactively refreshed session cookie.
        }
      },
    },
  });
}
