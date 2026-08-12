# lib/supabase

Supabase client boundary — authentication only. Not a data source: the
schedule/personnel source of truth remains Google Sheets (`lib/google`).

- `config.ts` — `readSupabasePublicConfig()`, reading
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. These
  are public by Supabase's own design (access is enforced by Row Level
  Security, not by keeping the publishable key secret), so this file has
  no server/client restriction — it's shared by `client.ts`, `server.ts`,
  and the root `proxy.ts` alike. Validation is lazy — only when a client
  is actually created — so `next build` succeeds without them configured.
- `client.ts` — `createSupabaseBrowserClient()`. Client-safe only
  (guarded by the `client-only` package) — used solely to start the
  Google OAuth redirect from the login screen.
- `server.ts` — `createSupabaseServerClient()`. Server-only, cookie-aware
  via the App Router `cookies()` API, for Server Components/Route
  Handlers/Server Actions. Deliberately a plain async function called
  fresh per request, never a module-level singleton — a request-bound
  client (and the identity it resolves) must never be reused across
  requests or leak between users.

Session refresh across requests is `proxy.ts` (repo root, alongside
`src/app/`) — it builds its own request/response-cookie-bound client
(the `NextRequest`/`NextResponse` cookie API, not `next/headers`), also
never shared/global. It only refreshes the session and propagates any
renewed cookies onto the response; it does not perform route protection
itself (that stays server-side in `(app)/layout.tsx`).

No service-role/secret key exists anywhere in this codebase — only the
public publishable key, on both the browser and server clients.
