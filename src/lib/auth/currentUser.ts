import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The authenticated identity, as three distinct states so a caller can
 * never conflate "no session" with "session exists but has no usable
 * email" — those require different UI behavior (redirect to /login vs.
 * an in-app denial screen). Email is the only personnel identity key: no
 * state here ever carries a provider display name / metadata name / user
 * ID as a stand-in for it.
 */
export type AuthIdentityResult =
  | { status: "unauthenticated" }
  | { status: "missing_email"; userId: string }
  | { status: "authenticated"; userId: string; email: string };

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
 * A session with no usable email is NOT the same as no session at all —
 * it must never redirect back into the login flow (that would loop) and
 * must never fall back to matching by display name/metadata/user ID.
 */
export async function getAuthenticatedIdentity(): Promise<AuthIdentityResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return { status: "unauthenticated" };

  const email = data.user.email;
  if (!email || email.trim() === "") {
    return { status: "missing_email", userId: data.user.id };
  }

  return { status: "authenticated", userId: data.user.id, email: email.trim() };
}
