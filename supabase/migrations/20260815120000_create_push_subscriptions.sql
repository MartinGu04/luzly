-- PR #29: Web Push subscription persistence.
--
-- One row per browser/device Web Push subscription. An authenticated
-- user may have many rows (multiple devices) -- see the index below.
-- A single physical browser subscription (identified by its `endpoint`)
-- must never be attributed to more than one user at a time -- see the
-- UNIQUE constraint and `upsert_push_subscription` below, which is the
-- ONLY supported way to create or reassign a row.
--
-- Only what Web Push actually needs is stored: no device fingerprinting,
-- no user-agent string, no personal metadata beyond the required
-- endpoint/keys and `last_seen_at` (last time this device's subscription
-- was confirmed/refreshed by the client).

create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  expiration_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

comment on table public.push_subscriptions is
  'One row per browser/device Web Push subscription (PR #29). endpoint is globally unique -- a physical subscription belongs to exactly one user at a time.';

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- RLS defaults to deny when no policy grants access -- so an
-- unauthenticated (anon) request already sees/affects zero rows with no
-- explicit "deny anon" policy needed. These two policies are the only
-- direct table access granted to `authenticated`:

create policy "push_subscriptions_select_own"
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Deliberately NO direct INSERT/UPDATE policy for `authenticated`.
-- Creating/reassigning a row goes through `upsert_push_subscription`
-- below instead -- see that function's own comment for why plain RLS
-- can't safely express "let this endpoint be handed to a new owner on
-- explicit re-subscribe" while still blocking a stranger from silently
-- editing someone else's existing row.

-- ---------------------------------------------------------------------
-- upsert_push_subscription -- the ONLY way to create or reassign a row.
--
-- Handles the shared-device / account-switch case: the same physical
-- browser subscription (endpoint) re-registering under a newly,
-- EXPLICITLY logged-in different account (e.g. user A subscribed on a
-- shared kiosk, logged out, user B logs in and explicitly presses "הפעל
-- התראות" too). SECURITY DEFINER is required for that one case -- a
-- plain RLS UPDATE policy is evaluated against the EXISTING row's
-- user_id, so user B could never reassign a row still owned by user A
-- through ordinary RLS alone.
--
-- This is still exactly as safe as RLS despite SECURITY DEFINER:
-- `auth.uid()` resolves from the calling request's own JWT (a
-- Postgres session-local setting, unaffected by SECURITY DEFINER's role
-- switch) -- never a client-supplied user id parameter -- so a row can
-- only ever be (re)assigned to whoever is ACTUALLY authenticated when
-- calling this function. `search_path` is pinned to prevent search-path
-- hijacking of a SECURITY DEFINER function (standard Postgres/Supabase
-- hardening for this pattern).
--
-- ON CONFLICT (endpoint) makes this idempotent -- calling it again with
-- the same endpoint (same user or a new one) updates the existing row
-- instead of erroring or duplicating it, exactly what PR #29 requires
-- for "pressing 'הפעל התראות' repeatedly must never create duplicate
-- rows".
-- ---------------------------------------------------------------------
create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time timestamptz
)
returns public.push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.push_subscriptions;
begin
  if auth.uid() is null then
    raise exception 'upsert_push_subscription requires an authenticated user';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, expiration_time, last_seen_at)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_expiration_time, now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        expiration_time = excluded.expiration_time,
        updated_at = now(),
        last_seen_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.upsert_push_subscription(text, text, text, timestamptz) from public;
grant execute on function public.upsert_push_subscription(text, text, text, timestamptz) to authenticated;
