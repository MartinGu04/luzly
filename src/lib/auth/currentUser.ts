import "server-only";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The authenticated identity, as three distinct states so a caller can
 * never conflate "no session" with "session exists but has no usable
 * email" — those require different UI behavior (redirect to /login vs.
 * an in-app denial screen). Email is the only personnel identity key: no
 * state here ever carries a provider display name / metadata name / user
 * ID as a stand-in for it.
 *
 * `avatarUrl` is presentation-only (the Google account's profile photo, as
 * Supabase already surfaced it in `user_metadata` from the OAuth sign-in --
 * never a separate Google API call, never a new scope). It must never be
 * used for identity matching/authorization — email remains the only
 * personnel identity key — and the raw `user_metadata` object this is
 * extracted from is never itself exposed to any caller.
 */
export type AuthIdentityResult =
  | { status: "unauthenticated" }
  | { status: "missing_email"; userId: string }
  | { status: "authenticated"; userId: string; email: string; avatarUrl: string | null };

/**
 * Picks a usable profile-photo URL out of the already-fetched Supabase
 * user's `user_metadata`, if one is present. Supabase's Google provider
 * conventionally mirrors it as `avatar_url` (its own cross-provider
 * convention) and/or `picture` (Google's own OIDC claim name) -- checked in
 * that order. Anything other than a genuine `https://` URL string is
 * treated as absent rather than trusted as-is: `user_metadata` is OAuth-provider-
 * supplied data, not server-verified the way `email` is, so this is
 * presentation-only and deliberately conservative about what it accepts.
 */
function extractAvatarUrl(user: User): string | null {
  const metadata = user.user_metadata;
  const candidate = metadata?.avatar_url ?? metadata?.picture;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  if (!/^https:\/\//.test(trimmed)) return null;
  return trimmed;
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

  return {
    status: "authenticated",
    userId: data.user.id,
    email: email.trim(),
    avatarUrl: extractAvatarUrl(data.user),
  };
}
