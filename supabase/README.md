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
`authenticated`, no service-role dependency, the cross-user key-match
check) -- it does not execute the SQL, so it can't prove runtime
behavior on its own.

`src/lib/push/upsertPushSubscriptionRpc.integration.test.ts` genuinely
DOES run this migration against a real PostgreSQL -- it creates a
throwaway database, stubs just enough of Supabase's `auth` schema, loads
this file verbatim, and exercises the exact reassignment/idempotency/
anonymous-denied scenarios the RPC is designed to enforce. It probes for
a reachable Postgres at import time and skips itself entirely (never
fails) when none is found, since this repository has no CI-provisioned
database -- see that file's own docstring. Point `TEST_DATABASE_URL` at
any reachable Postgres (a role with `CREATEDB`) to run it; it was run
for real against a local PostgreSQL 16 during this PR's development.

## `migrations/20260815130000_create_notification_engine.sql` (PR #30)

Durable state for the automatic notification worker: baseline/rollover
tracking, normalized semantic facts, debounced pending changes, and the
notification outbox + per-device deliveries. Apply it the same way as
above (Dashboard SQL Editor or `supabase db push`), to every Supabase
project this app talks to, AFTER the push_subscriptions migration
(`notification_deliveries` references `push_subscriptions`).

Unlike the push_subscriptions migration, this ONE migration's three
functions (`advance_notification_baseline`,
`claim_due_pending_notification_changes`, `claim_due_notification_jobs`)
are granted to `service_role` only, not `authenticated` — the worker has
no logged-in user to key `auth.uid()` off, and every one of its five
tables enables RLS with zero policies (default-deny for
anon/authenticated either way). See the migration file's own top comment
for why this is a deliberate, narrowly-scoped exception to the
zero-service-role convention above, and
`src/lib/supabase/serviceRoleClient.ts` for the one Supabase client
allowed to use it.

`src/lib/notifications/engine/migration.test.ts` is this migration's
text-level security-shape guard (same pattern as
`lib/push/migration.test.ts`).
`src/lib/notifications/engine/notificationEngineFunctions.integration.test.ts`
genuinely runs it against a real PostgreSQL, including real concurrent-
connection proofs of the `for update`/`for update skip locked` claiming
behavior — same self-skipping-when-no-database convention as
`upsertPushSubscriptionRpc.integration.test.ts`.

## Extending this later

Any future migration goes in this same directory, named
`<timestamp>_<description>.sql`, following the same explicit-RLS,
ownership-derived-from-`auth.uid()`-where-applicable pattern established
here — and the no-service-role convention specifically, unless a new
case has the same genuine no-user-session justification PR #30's worker
does.
