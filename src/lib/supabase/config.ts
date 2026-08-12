export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

/** Thrown when the Supabase public config is missing or invalid. */
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

/**
 * Reads the public Supabase config. These are `NEXT_PUBLIC_*` by design —
 * the publishable key is meant to be shipped to the browser (access is
 * enforced by Supabase Row Level Security, not by keeping this secret) —
 * so this module has no server-only/client-only restriction and is safe
 * to import from `lib/supabase/client.ts`, `lib/supabase/server.ts`, and
 * `proxy.ts` alike. No service-role/secret key is ever read here.
 *
 * Never validated at module load — only when a Supabase client is
 * actually created — so `next build` succeeds without these configured.
 */
export function readSupabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0 || !url || !publishableKey) {
    throw new SupabaseConfigError(`Missing Supabase configuration: ${missing.join(", ")}.`);
  }

  return { url, publishableKey };
}
