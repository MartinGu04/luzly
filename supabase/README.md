# supabase/

SQL migrations for the Supabase project. This repository had no
migrations at all before PR #29 (auth alone needs no custom schema --
just Supabase's own built-in `auth.users`), so this directory and its
conventions are new as of this PR.

## Applying `migrations/20260815120000_create_push_subscriptions.sql`

This has **not** been applied to any live Supabase project by this PR --
there are no real Supabase credentials in this environment. Apply it
yourself, once, against both your Preview/staging and Production Supabase
projects (they are separate databases with separate schemas), using
**one** of:

**Option A -- Supabase Dashboard SQL Editor (no CLI setup required)**
1. Open your Supabase project -> SQL Editor -> New query.
2. Paste the full contents of
   `supabase/migrations/20260815120000_create_push_subscriptions.sql`.
3. Run it.
4. Repeat for every other Supabase project this app talks to (e.g. a
   separate Preview vs. Production project, if you use one).

**Option B -- Supabase CLI, if this project is linked to a Supabase project**
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## What it creates

- `public.push_subscriptions` -- one row per browser/device Web Push
  subscription, RLS-protected so a user can only ever see/delete their
  own rows (`lib/notifications`/`lib/push` never use a service-role key,
  matching this project's existing zero-service-role convention -- see
  `src/lib/supabase/README.md`).
- `public.upsert_push_subscription(...)` -- a `SECURITY DEFINER` RPC, the
  only way a row is created or its ownership reassigned. See the
  migration file's own extensive comments for exactly why this needs
  `SECURITY DEFINER` (the shared-device/account-switch case) and why it
  is still exactly as safe as RLS (`auth.uid()` inside the function still
  resolves from the real caller's session, never a client-supplied
  value).

`src/lib/push/migration.test.ts` is a text-level regression guard on this
file's security-critical shape (RLS enabled, grants restricted to
`authenticated`, no service-role dependency) -- it cannot verify the SQL
actually runs against a real Postgres, since none exists in this
environment.

## Extending this later

Any future migration goes in this same directory, named
`<timestamp>_<description>.sql`, following the same explicit-RLS,
no-service-role, ownership-derived-from-`auth.uid()` pattern established
here.
