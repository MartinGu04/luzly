import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * Refreshes/validates the Supabase auth session on every matched request
 * and propagates any refreshed cookies onto the response, per the current
 * official @supabase/ssr pattern for Next.js.
 *
 * This does NOT perform route protection itself — protected pages still
 * gate access server-side in their own layout via `resolveCurrentPerson()`
 * (`src/app/(app)/layout.tsx`). This only keeps the session cookie valid
 * so that check always sees fresh data, instead of a stale/expired token.
 *
 * Deliberately builds its own request/response-bound Supabase client
 * here — Proxy uses the `NextRequest`/`NextResponse` cookie API, not the
 * `next/headers` `cookies()` API that `lib/supabase/server.ts` uses for
 * Server Components/Route Handlers/Server Actions, so the two can't share
 * a client. Either way, a fresh client is created per request — never a
 * shared/global instance — so no session can leak between requests or
 * users, and no service-role/secret key is used, only the public
 * publishable key.
 *
 * Config is only read once this function actually runs (per request),
 * never at module load, so `next build` succeeds without Supabase env
 * vars configured; a request that reaches an unconfigured deployment
 * throws a clear typed SupabaseConfigError instead of silently proceeding.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabaseConfig = readSupabasePublicConfig();

  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Revalidates the session against the Supabase Auth server. When the
  // token needs refreshing, @supabase/ssr calls the `setAll` cookie
  // adapter above internally, which is what actually propagates the
  // renewed session onto `response`.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every request except:
     * - _next/static (build assets)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
