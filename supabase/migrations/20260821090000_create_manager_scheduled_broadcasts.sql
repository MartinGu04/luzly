-- ---------------------------------------------------------------------
-- manager_scheduled_broadcasts -- a manager can schedule a manual
-- broadcast ("שליחת התראה") for a future Asia/Jerusalem instant instead
-- of sending it immediately. Deliberately NOT a second delivery engine
-- and deliberately NOT `notification_jobs` rows created up front: a
-- scheduled broadcast is intentionally MUTABLE (title/body/time/audience
-- may change, or it may be cancelled) right up until dispatch claims it,
-- which `notification_jobs`/`manager_notification_batches` rows cannot
-- be (see `20260821080000_create_manager_notification_batches.sql`'s own
-- immutability guarantee). Once claimed, this row becomes a normal
-- `manager_notification_batches` batch through the EXACT SAME PR #78
-- pipeline (`lib/notifications/engine/manualBroadcast.ts`'s job-creation
-- primitives) -- this table only ever gets that pipeline started, never
-- duplicates its recipient-resolution or delivery-state logic.
--
-- Lifecycle: 'scheduled' (editable/cancellable) -> 'claimed' (an atomic
-- claim -- by the worker tick once due, or by "שלח עכשיו" -- has begun
-- dispatch; no longer editable/cancellable) -> 'dispatched' (its
-- `manager_notification_batches` row and every resolved recipient's
-- `notification_jobs` row exist). 'cancelled' is a separate terminal
-- state reachable only from 'scheduled'.
--
-- `target_person_ids` is the FROZEN audience snapshot as of save/last
-- edit time -- for `audience_kind = 'everyone'` this already holds the
-- roster expanded to person ids at that moment (never re-expanded at
-- dispatch), so a person added to כ"א afterward can never silently join
-- an existing scheduled send. `batch_id` is this row's own dispatch
-- checkpoint: once set, the batch already exists and is never recreated
-- or compared-for-replay again -- a worker crash after this point only
-- ever needs to retry (idempotent) job creation for that same batch, not
-- re-decide whether a batch should exist at all. Before this checkpoint,
-- a crashed claim is safe to fully reclaim back to 'scheduled' (see the
-- claim function below), because nothing has been persisted outside this
-- row yet.
-- ---------------------------------------------------------------------
create table if not exists public.manager_scheduled_broadcasts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'scheduled',
  audience_kind text not null,
  target_person_ids text[] not null default '{}',
  title text not null,
  body text not null,
  scheduled_for timestamptz not null,
  created_by_person_id text not null,
  created_by_person_name text not null,
  last_changed_by_person_id text,
  last_changed_by_person_name text,
  cancelled_by_person_id text,
  cancelled_by_person_name text,
  -- The manager who actually pressed "שלח עכשיו", if that's how this row
  -- was claimed -- distinct from `created_by_person_id`/last-editor,
  -- since a DIFFERENT manager may trigger an immediate send on someone
  -- else's schedule. Recorded atomically by
  -- `claim_manager_scheduled_broadcast_now` itself, from the AUTHENTICATED
  -- caller only (never client-supplied) -- so only the manager whose
  -- claim actually wins is ever attributed. NULL for a normal due-time
  -- worker dispatch, which keeps `created_by_person_id`/name as the
  -- eventual batch's sender (see `lib/notifications/engine/scheduledBroadcast.ts`'s
  -- `batchCreatorForRow`).
  sent_now_by_person_id text,
  sent_now_by_person_name text,
  sent_now_at timestamptz,
  claimed_at timestamptz,
  batch_id uuid references public.manager_notification_batches (id),
  dispatched_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manager_scheduled_broadcasts_status_check
    check (status in ('scheduled', 'claimed', 'dispatched', 'cancelled')),
  constraint manager_scheduled_broadcasts_audience_kind_check
    check (audience_kind in ('person', 'people', 'everyone'))
);

-- The claim query's own access path: only 'scheduled' rows that are due,
-- ordered by due time.
create index if not exists manager_scheduled_broadcasts_due_idx
  on public.manager_scheduled_broadcasts (scheduled_for)
  where status = 'scheduled';

-- The manager UI's "active scheduled" list (status in ('scheduled','claimed')).
create index if not exists manager_scheduled_broadcasts_active_idx
  on public.manager_scheduled_broadcasts (scheduled_for)
  where status in ('scheduled', 'claimed');

alter table public.manager_scheduled_broadcasts enable row level security;

-- No RLS policies declared -- same "service-role only, default-deny"
-- convention every other notification-engine table already uses. Only
-- `getNotificationServiceClient()` ever reads/writes this table.

-- -----------------------------------------------------------------------
-- claim_due_manager_scheduled_broadcasts -- the worker tick's atomic claim
-- for scheduled broadcasts, mirroring `claim_due_notification_jobs`'s own
-- `for update skip locked` pattern so two overlapping ticks can never
-- claim the same row.
--
-- Two kinds of row are eligible in one pass:
--  1. 'scheduled' rows whose `scheduled_for` is due -- an ordinary fresh
--     claim, transitioning 'scheduled' -> 'claimed'.
--  2. 'claimed' rows that already have a `batch_id` -- a dispatch that
--     was interrupted (worker crash) AFTER its batch checkpoint was
--     written but before the row could be marked 'dispatched'. These are
--     always safe to "reclaim" (re-select) regardless of `claimed_at`
--     age: resuming them only ever retries idempotent job creation for
--     an already-fixed batch/recipient set, never re-decides anything.
--
-- A 'claimed' row with NO `batch_id` (dispatch crashed before its
-- checkpoint -- nothing persisted outside this row yet) is instead fully
-- reset back to 'scheduled' once its claim is older than the worker's own
-- crash-recovery window, so the NEXT claim re-runs the whole dispatch
-- (including a fresh recipient resolution) from scratch -- exactly the
-- same "claimed but stale -> back to pending" policy
-- `claim_due_notification_jobs` already uses.
-- -----------------------------------------------------------------------
create or replace function public.claim_due_manager_scheduled_broadcasts(p_limit integer default 50)
returns setof public.manager_scheduled_broadcasts
language plpgsql
as $$
begin
  update public.manager_scheduled_broadcasts
    set status = 'scheduled', claimed_at = null, updated_at = now()
    where status = 'claimed' and batch_id is null and claimed_at < now() - interval '4 minutes';

  return query
    update public.manager_scheduled_broadcasts b
      set status = 'claimed', claimed_at = now(), updated_at = now()
      where b.id in (
        select id from public.manager_scheduled_broadcasts
        where (status = 'scheduled' and scheduled_for <= now())
           or (status = 'claimed' and batch_id is not null)
        order by scheduled_for
        limit p_limit
        for update skip locked
      )
      returning b.*;
end;
$$;

revoke all on function public.claim_due_manager_scheduled_broadcasts(integer) from public, anon, authenticated;
grant execute on function public.claim_due_manager_scheduled_broadcasts(integer) to service_role;

-- -----------------------------------------------------------------------
-- claim_manager_scheduled_broadcast_now -- the single-row atomic claim
-- behind "שלח עכשיו". A plain conditional `update ... where id = $1 and
-- status = 'scheduled'` is already race-safe on its own (Postgres's own
-- row lock serializes any concurrent claim attempt on the same row,
-- whether from this function, another concurrent "שלח עכשיו" click, or
-- `claim_due_manager_scheduled_broadcasts`'s own bulk claim -- whichever
-- transaction commits first wins, the other's `where` re-evaluates against
-- the now-changed status and affects zero rows). Returns zero rows when
-- the broadcast is no longer 'scheduled' (already claimed/dispatched/
-- cancelled) -- the caller reports this truthfully rather than silently
-- no-op'ing.
--
-- `p_sent_now_by_person_id`/`p_sent_now_by_person_name` are written in the
-- SAME atomic update as the winning `scheduled -> claimed` transition --
-- so this identity is only ever recorded for whichever caller's claim
-- actually succeeds, never for a caller that lost the race. The caller
-- (`lib/notifications/engine/scheduledBroadcast.ts`) is trusted to pass
-- only the already-authenticated manager's own identity here -- this
-- function itself performs no authorization, exactly like the rest of
-- this table's service-role-only surface.
-- -----------------------------------------------------------------------
create or replace function public.claim_manager_scheduled_broadcast_now(
  p_id uuid,
  p_sent_now_by_person_id text,
  p_sent_now_by_person_name text
)
returns setof public.manager_scheduled_broadcasts
language plpgsql
as $$
begin
  return query
    update public.manager_scheduled_broadcasts
      set status = 'claimed', claimed_at = now(), updated_at = now(),
          sent_now_by_person_id = p_sent_now_by_person_id,
          sent_now_by_person_name = p_sent_now_by_person_name,
          sent_now_at = now()
      where id = p_id and status = 'scheduled'
      returning *;
end;
$$;

revoke all on function public.claim_manager_scheduled_broadcast_now(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_manager_scheduled_broadcast_now(uuid, text, text) to service_role;
