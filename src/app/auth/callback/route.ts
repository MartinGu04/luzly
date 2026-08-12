import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/auth/safeRedirect";

/**
 * Exchanges the Google OAuth `code` for a Supabase session. Success
 * redirects into the app (to a sanitized internal `next` path, defaulting
 * to "/"); any failure — no code, or the exchange itself failing — is a
 * safe generic redirect to /login?error=auth, never exposing provider
 * error details.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
