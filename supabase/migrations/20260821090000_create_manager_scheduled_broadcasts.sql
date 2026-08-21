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
-- `create_idempotency_key` is a SEPARATE idempotency boundary from
-- `batch_id`/the eventual batch's own `scheduled:<id>` key -- this one
-- guards CREATION itself (a manager double-clicking "שמירת תזמון", or a
-- retried request, must produce at most one scheduled row), the exact
-- same client-compose-session-key pattern PR #78's immediate send already
-- uses for `manager_notification_batches.idempotency_key`. It is NEVER
-- reused for dispatch -- the eventual batch still keys off this row's own
-- `id` (`scheduled:<id>`), computed only after a row already exists. A
-- repeated create request with the same key finds and returns the
-- EXISTING row (via the unique constraint's `23505` conflict) rather than
-- inserting a second one, and this lookup NEVER performs an `update` --
-- so a very late replay of the original create request can never
-- overwrite an edit that happened to the row in between (see
-- `lib/notifications/engine/scheduledBroadcast.ts`'s `createScheduledBroadcast`).
--
-- `target_person_ids` is the FROZEN audience snapshot as of save/last
-- edit time -- for `audience_kind = 'everyone'` this already holds the
-- roster expanded to person ids at that moment (never re-expanded at
-- dispatch), so a person added to כ"א afterward can never silently join
-- an existing scheduled send. `batch_id` is this row's own dispatch
-- checkpoint: once set, the batch already exists and is never recreated
-- or compared-for-replay again -- a worker crash after this point only
-- ever needs to retry (idempotent) job creation for that same batch, not
-- re-decide whether a batch should exist at all.
--
-- IMPORTANT: a `'claimed'` row with NO `batch_id` yet is NOT proof that
-- nothing has been persisted outside this row -- `manager_notification_batches`
-- insertion and this row's own `batch_id` checkpoint are two SEPARATE
-- statements (see `lib/notifications/engine/scheduledBroadcast.ts`'s
-- `dispatchScheduledBroadcast`), so a crash between them leaves a
-- genuinely immutable batch already in existence while this row still
-- shows `batch_id is null`. `'claimed'` is therefore an IRREVERSIBLE
-- boundary once reached: this row must NEVER transition back to
-- `'scheduled'` (which would make it editable/cancellable again) no
-- matter how stale its claim looks. Crash recovery always RESUMES
-- dispatch on a still-`'claimed'` row -- it never reopens the draft. See
-- `claim_due_manager_scheduled_broadcasts` below for exactly how a stale
-- pre-checkpoint claim is safely re-entered.
-- ---------------------------------------------------------------------
create table if not exists public.manager_scheduled_broadcasts (
  id uuid primary key default gen_random_uuid(),
  -- The compose-session key behind exactly-once CREATION -- see this
  -- table's own doc comment above. Distinct from `batch_id`/the eventual
  -- batch's `scheduled:<id>` dispatch-idempotency key.
  create_idempotency_key text not null,
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
  constraint manager_scheduled_broadcasts_create_idempotency_key_unique
    unique (create_idempotency_key),
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
-- Three kinds of row are eligible in one pass, ALL of which resolve to
-- the SAME update (`status = 'claimed'`, `claimed_at = now()`) -- a row
-- already `'claimed'` simply has its claim refreshed, never reset:
--  1. `'scheduled'` rows whose `scheduled_for` is due -- an ordinary
--     fresh claim, transitioning `'scheduled' -> 'claimed'`.
--  2. `'claimed'` rows that already have a `batch_id` -- a dispatch
--     interrupted (worker crash) AFTER its batch checkpoint was written
--     but before the row could be marked `'dispatched'`. Always safe to
--     resume regardless of `claimed_at` age: retrying only ever redoes
--     idempotent job creation for an already-fixed batch/recipient set.
--  3. `'claimed'` rows with NO `batch_id` yet whose claim is older than
--     the worker's own crash-recovery window -- a dispatch interrupted
--     BEFORE its batch checkpoint. Critically, this does NOT mean
--     nothing was persisted: `manager_notification_batches` insertion
--     and this row's own `batch_id` checkpoint are two separate
--     statements (see the table's own doc comment above), so the
--     immutable batch may already exist. This row is therefore
--     RE-CLAIMED (stays `'claimed'`, `claimed_at` refreshed) rather than
--     ever reset to `'scheduled'` -- resuming dispatch re-runs
--     `insertManagerNotificationBatchIfAbsent`'s own deterministic
--     `scheduled:<id>` idempotency key, which transparently finds the
--     already-created batch (or creates it fresh if the crash happened
--     even earlier) and checkpoints it -- never a second logical batch,
--     and never a window where this row is briefly editable/cancellable
--     again. This ALSO preserves an explicit "שלח עכשיו" intent across a
--     crash: `sent_now_by_*` is untouched by this reclaim, and eligibility
--     here has no `scheduled_for` condition at all, so a stale send-now
--     claim for a broadcast whose `scheduled_for` is still far in the
--     future is reclaimed immediately once stale, never silently
--     degrading into "wait until the original due time".
-- -----------------------------------------------------------------------
create or replace function public.claim_due_manager_scheduled_broadcasts(p_limit integer default 50)
returns setof public.manager_scheduled_broadcasts
language plpgsql
as $$
begin
  return query
    update public.manager_scheduled_broadcasts b
      set status = 'claimed', claimed_at = now(), updated_at = now()
      where b.id in (
        select id from public.manager_scheduled_broadcasts
        where (status = 'scheduled' and scheduled_for <= now())
           or (status = 'claimed' and batch_id is not null)
           or (status = 'claimed' and batch_id is null and claimed_at < now() - interval '4 minutes')
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
