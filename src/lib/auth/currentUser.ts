import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The authenticated Luzly identity — deliberately minimal: no role/capability data lives here. */
export interface AuthenticatedIdentity {
  userId: string;
  email: string;
}

/**
 * Resolves the authenticated identity securely, server-side.
 *
 * Uses Supabase's `getUser()`, not `getSession()` — `getUser()`
 * revalidates the token against the Supabase Auth server on every call,
 * where `getSession()` only trusts whatever is in the local cookie. This
 * is what "never trust a browser-submitted email" requires here: the
 * email always comes from Supabase's server-verified user record, never
 * from anything the client could have supplied directly.
 *
 * Returns null when there is no authenticated user, or when the
 * authenticated account has no usable email — this never falls back to
 * matching by display name.
 */
export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  const email = data.user.email;
  if (!email || email.trim() === "") return null;

  return { userId: data.user.id, email: email.trim() };
}
