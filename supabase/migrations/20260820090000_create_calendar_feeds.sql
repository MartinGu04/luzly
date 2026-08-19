-- Personal calendar subscription feeds (מי-מה-מו -> Google/Apple Calendar).
--
-- One row per user who has enabled calendar sync. `token` is a
-- cryptographically random, unguessable identifier that authorizes
-- read-only access to that one user's ICS feed
-- (GET /calendar/<token>.ics, see src/app/calendar/[token]/route.ts) --
-- external calendar clients cannot present our normal Supabase session
-- cookie, so possession of this token IS the authorization for that one
-- request, exactly like a Web Push endpoint or the notification worker's
-- bearer secret.
--
-- Deliberately stored as plain text, NOT hashed like a password: the
-- product requires "Copy Link" / "Add to Google Calendar" / "Add to
-- Apple Calendar" to keep working for the feed's owner at any time while
-- sync stays enabled, not only once at creation -- the same reason
-- GitHub/Todoist/etc. store their own private calendar-feed tokens
-- retrievably rather than as a one-way hash. RLS (below) is what keeps
-- this safe: only the owning user's own authenticated session can ever
-- select their own row.
--
-- `user_id` is UNIQUE -- one feed per user, matching the product's
-- enable/reset/disable model (PR calendar-subscription spec): "enable"
-- creates this row if absent, "reset" rotates `token` in place, and
-- "disable" deletes the row outright so the previous URL immediately
-- stops resolving to anything.

create extension if not exists pgcrypto;

create table if not exists public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.calendar_feeds is
  'One row per user with personal calendar sync enabled. token authorizes GET /calendar/<token>.ics -- see src/app/calendar/[token]/route.ts.';

alter table public.calendar_feeds enable row level security;

-- RLS defaults to deny when no policy grants access, so an unauthenticated
-- (anon) request already sees/affects zero rows with no explicit "deny
-- anon" policy needed. These four policies are the only direct table
-- access granted to `authenticated`, every one of them scoped to the
-- caller's own row -- unlike push_subscriptions, there is no shared-
-- device/cross-user reassignment case here (a user can never collide with
-- another user's row: `user_id` is unique, and every write is already
-- scoped to `auth.uid()`), so no SECURITY DEFINER RPC is needed for
-- enable/reset/disable -- plain RLS-scoped inserts/updates/deletes from
-- the authenticated user's own Supabase session client are sufficient.
create policy "calendar_feeds_select_own"
  on public.calendar_feeds
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "calendar_feeds_insert_own"
  on public.calendar_feeds
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "calendar_feeds_update_own"
  on public.calendar_feeds
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "calendar_feeds_delete_own"
  on public.calendar_feeds
  for delete
  to authenticated
  using (user_id = auth.uid());

-- The ICS route itself (src/app/calendar/[token]/route.ts) is reached by
-- external calendar clients that carry no Supabase session at all -- only
-- the bare `token` from the URL -- so it cannot use an RLS-scoped client
-- to look its owner up. It uses the service-role client instead (the
-- SECOND legitimate call site alongside the notification worker; see
-- src/lib/calendar/serviceClient.ts and
-- src/app/notificationServiceRoleBoundary.test.ts). The `unique (token)`
-- constraint above already provides the index that lookup needs -- a
-- single indexed equality match, never a table scan.
