-- Personal Home dashboard "מה השתנה מאז הפעם הקודמת" recap: a per-user,
-- cross-device cursor for the LAST genuine Home visit. Upgrades the old
-- PR #36 recap (a hardcoded 72-hour recent-changes window) into a true
-- "since your previous Home visit" recap -- this table is the ONLY new
-- storage that upgrade needs; the settled `notification_jobs` outbox
-- stays the single source of truth for "did anything real happen?" (see
-- `src/lib/readModels/recentDashboardChanges.ts`), never a second
-- baseline/diff engine.
--
-- A "visit" here means specifically a real mount/navigation to the
-- personal Home route `/` -- see `src/components/dashboard/DashboardVisitMarker.tsx`
-- for the exact client-side mount semantics this row is written from.
-- It deliberately does NOT mean: Supabase auth, opening any other route,
-- opening the Notification Bell, `router.refresh()`, or `AppRevalidator`'s
-- periodic/background refresh of an already-mounted Home instance.
--
-- Deliberately its own dedicated table rather than overloading
-- `notification_inbox_state` (PR #34's "נקה התראות" cutoff) -- both
-- happen to be a one-row-per-user timestamp cursor, but they answer
-- unrelated questions (inbox dismissal vs. personal Home visit history)
-- and are read/written by entirely different flows; sharing a row would
-- only couple two features that have no reason to change together.
create table if not exists public.dashboard_visit_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_visited_at timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.dashboard_visit_state is
  'One row per user: the instant of their last genuine personal Home visit. The "מה השתנה מאז הפעם הקודמת" recap queries settled notification_jobs created after this cutoff. Written ONLY via record_dashboard_visit(), and ONLY after the Home screen has actually mounted client-side -- never during server render.';

alter table public.dashboard_visit_state enable row level security;

-- RLS defaults to deny when no policy grants access -- SERVICE ROLE,
-- deliberately, same posture as every other per-user notification-
-- adjacent state table (`notification_inbox_state`, `push_subscriptions`):
-- zero RLS policies here, so even a bypassed/misused browser-authenticated
-- request sees and can change nothing in this table directly. Every
-- read/write goes through `src/lib/dashboardVisit/store.ts`, which always
-- re-derives the authenticated user server-side (`getAuthenticatedIdentity()`)
-- and never accepts a client-supplied user id -- see that file's own
-- docstring, and `src/lib/dashboardVisit/actions.ts` for the one Server
-- Action allowed to trigger the write.

-- ---------------------------------------------------------------------
-- record_dashboard_visit -- the ONLY writer of dashboard_visit_state.
-- Atomic, monotonic upsert: `greatest(...)` guarantees a stale/duplicate/
-- out-of-order write (a retried request, a StrictMode double-effect, a
-- slow request finally landing after a newer one already committed) can
-- NEVER move a user's cutoff backwards -- see PR spec section 8/18 for
-- why that matters (a semantic change settling between the server's
-- recap read and the client's mount-marker write must remain eligible
-- for the NEXT visit, never silently swallowed by a cutoff that jumped
-- past it).
-- ---------------------------------------------------------------------
create or replace function public.record_dashboard_visit(p_user_id uuid, p_visited_at timestamptz)
returns void
language sql
as $$
  insert into public.dashboard_visit_state (user_id, last_visited_at, updated_at)
  values (p_user_id, p_visited_at, now())
  on conflict (user_id) do update
    set last_visited_at = greatest(public.dashboard_visit_state.last_visited_at, excluded.last_visited_at),
        updated_at = now();
$$;

revoke all on function public.record_dashboard_visit(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_dashboard_visit(uuid, timestamptz) to service_role;
