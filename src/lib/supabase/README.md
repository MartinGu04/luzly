# lib/supabase

Supabase client boundary — authentication only. Not a data source: the
schedule/personnel source of truth remains Google Sheets (`lib/google`).

- `config.ts` — `readSupabasePublicConfig()`, reading
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`. These are
  public by Supabase's own design (access is enforced by Row Level
  Security, not by keeping the anon key secret), so this file has no
  server/client restriction. Validation is lazy — only when a client is
  actually created — so `next build` succeeds without them configured.
- `client.ts` — `createSupabaseBrowserClient()`. Client-safe only
  (guarded by the `client-only` package) — used solely to start the
  Google OAuth redirect from the login screen.
- `server.ts` — `createSupabaseServerClient()`. Server-only, cookie-aware
  via the App Router `cookies()` API. Deliberately a plain async function
  called fresh per request, never a module-level singleton — a
  request-bound client (and the identity it resolves) must never be
  reused across requests or leak between users.

No service-role client exists in this codebase.
