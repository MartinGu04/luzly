-- PR #30: Automatic notification engine -- durable server-side state.
--
-- Every table here is internal engine state for the scheduled worker
-- (Supabase Cron -> POST /internal/notifications/tick). None of it is
-- schedule/duty/coverage data itself -- Google Sheets remains the source
-- of truth and is never written to. Only small, normalized facts needed
-- to detect a MEANINGFUL semantic change (see the worker's own docs)
-- are persisted -- never a raw workbook row/cell.
--
-- SERVICE ROLE, deliberately: PR #29's push_subscriptions migration
-- states this codebase uses no service-role key anywhere, because every
-- access there is initiated by a logged-in browser user with a real
-- session/JWT the RLS-scoped client can rely on. The notification worker
-- is different in kind: it runs on a Supabase Cron trigger with NO
-- logged-in user and NO session, yet must read/write state across every
-- user's subscriptions and recipients. There is no `auth.uid()` for RLS
-- to key off in that context, so an RLS-scoped client cannot do this
-- work at all. The worker route is itself gated by a separate
-- server-only shared secret (`NOTIFICATION_WORKER_SECRET`, checked
-- before any of this is ever touched -- see
-- `src/lib/notifications/workerAuth.ts`), and the service-role Supabase
-- client it uses is `import "server-only"`-gated and never referenced
-- from client code (see `src/lib/supabase/serviceRoleClient.ts` and its
-- regression guard). Every table below enables RLS with ZERO policies,
-- so even if the service-role gate were ever bypassed by mistake, an
-- ordinary authenticated/anon request still sees and can change nothing
-- here -- only the service role (which bypasses RLS entirely, by
-- Postgres role, not by policy) can touch these tables. The three
-- functions below are additionally restricted with an explicit
-- `revoke ... from public, anon, authenticated` + `grant ... to
-- service_role` pair, so even accidentally-broad PostgREST exposure
-- can't let a browser caller invoke them.

-- ---------------------------------------------------------------------
-- notification_baseline_state -- one singleton row. Tracks whether the
-- worker has ever completed its first silent baseline capture, and which
-- operational week (Sunday-based, Asia/Jerusalem) it currently considers
-- "current". See `advance_notification_baseline` below for the atomic
-- first-run/rollover/unchanged decision this row exists to serialize.
-- ---------------------------------------------------------------------
create table if not exists public.notification_baseline_state (
  id smallint primary key default 1,
  initialized boolean not null default false,
  current_week_start date,
  initialized_at timestamptz,
  rolled_over_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint notification_baseline_state_singleton check (id = 1)
);

insert into public.notification_baseline_state (id) values (1)
  on conflict (id) do nothing;

alter table public.notification_baseline_state enable row level security;

-- ---------------------------------------------------------------------
-- observed_notification_facts -- the last SETTLED normalized truth for
-- the current operational week only, one row per (week_start_date,
-- fact_key). `fact_key` encodes category + entity + date (+ domain id
-- where relevant), e.g. "shift:p_1a2b3c4d:2026-08-18" or
-- "team:p_1a2b3c4d:2026-08-18:day" or "coverage:2026-08-18:night".
-- `fact_value` is a small semantic snapshot (never raw sheet text) --
-- see `src/lib/notifications/engine/semanticFacts.ts` for the exact
-- shapes. Diffing THIS against a fresh read is what "semantic diffing,
-- not raw cell diffing" (PR #30 spec) means in practice.
-- ---------------------------------------------------------------------
create table if not exists public.observed_notification_facts (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null,
  fact_key text not null,
  category text not null,
  fact_value jsonb not null,
  updated_at timestamptz not null default now(),
  constraint observed_notification_facts_unique unique (week_start_date, fact_key)
);

create index if not exists observed_notification_facts_week_idx
  on public.observed_notification_facts (week_start_date);

alter table public.observed_notification_facts enable row level security;

-- ---------------------------------------------------------------------
-- pending_notification_changes -- one open debounce candidate per
-- fact_key. `original_value` is the value at the moment the change was
-- FIRST observed this debounce cycle; `latest_value` updates on every
-- subsequent observation; `settle_at` is recomputed to `now() + debounce`
-- on every observation, so it is a genuine QUIET-PERIOD debounce (settles
-- 10 minutes after the LAST change, not 10 minutes after the first) --
-- see PR #30 spec section 11. A change that returns to its original value
-- before settling is deleted outright (never notified).
-- ---------------------------------------------------------------------
create table if not exists public.pending_notification_changes (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null,
  fact_key text not null,
  category text not null,
  original_value jsonb not null,
  latest_value jsonb not null,
  first_changed_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  settle_at timestamptz not null,
  status text not null default 'pending',
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pending_notification_changes_unique unique (week_start_date, fact_key),
  constraint pending_notification_changes_status_check
    check (status in ('pending', 'claimed'))
);

create index if not exists pending_notification_changes_settle_idx
  on public.pending_notification_changes (status, settle_at);

alter table public.pending_notification_changes enable row level security;

-- ---------------------------------------------------------------------
-- notification_jobs -- the durable outbox. One row per logical
-- notification for one recipient (never per push subscription/device --
-- see notification_deliveries below for the per-device fan-out).
-- `dedupe_key` is the sole idempotency guarantee: every job-creation path
-- (settled semantic change, tomorrow reminder, weekly constraints
-- reminder) computes it deterministically and inserts with
-- `on conflict (dedupe_key) do nothing` (or a status-guarded `do update`
-- for reminders whose content can legitimately change before send), so a
-- retried/duplicate worker tick can never create two logical
-- notifications for the same real-world event.
--
-- `recipient_user_id` is always a resolved `auth.users.id` at job-
-- creation time (never a raw sheet name/email carried forward) -- see
-- `src/lib/notifications/engine/recipients.ts`.
-- ---------------------------------------------------------------------
create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  path text not null,
  tag text,
  dedupe_key text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  claimed_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_jobs_dedupe_key_unique unique (dedupe_key),
  constraint notification_jobs_status_check
    check (status in ('pending', 'claimed', 'completed', 'failed', 'cancelled', 'skipped'))
);

create index if not exists notification_jobs_due_idx
  on public.notification_jobs (status, scheduled_for);

create index if not exists notification_jobs_recipient_idx
  on public.notification_jobs (recipient_user_id);

alter table public.notification_jobs enable row level security;

-- ---------------------------------------------------------------------
-- notification_deliveries -- one row per (job, push subscription) --
-- the multi-device fan-out. A device that already succeeded is never
-- re-attempted (see `claim_due_notification_jobs`'s caller in
-- `src/lib/notifications/engine/delivery.ts`, which only (re)attempts
-- rows still in 'pending'/'failed_transient'), so one device's transient
-- failure and eventual retry can never duplicate-send to a device that
-- already got the notification.
-- ---------------------------------------------------------------------
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.notification_jobs (id) on delete cascade,
  push_subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_attempted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_unique unique (job_id, push_subscription_id),
  constraint notification_deliveries_status_check
    check (status in ('pending', 'sent', 'failed_permanent', 'failed_transient'))
);

create index if not exists notification_deliveries_job_idx
  on public.notification_deliveries (job_id);

alter table public.notification_deliveries enable row level security;

-- No RLS policies are declared for any of the five tables above --
-- RLS defaults to deny with zero policies, so `anon`/`authenticated`
-- already see and can change nothing. Only the service-role connection
-- (bypasses RLS by Postgres role) can read/write them; there is
-- deliberately no path for an ordinary browser user, matching the PR #30
-- spec's "internal notification engine tables should not be directly
-- writable/readable by normal browser users... default-deny".

-- ---------------------------------------------------------------------
-- advance_notification_baseline -- the ONLY writer of
-- notification_baseline_state. Atomically decides, for a freshly-
-- computed operational week start date, whether this is the worker's
-- first-ever run ('initialized'), a week rollover ('rolled_over', also
-- returning the previous week so the caller can clear stale state for
-- it), or an ordinary tick against an already-current week
-- ('unchanged'). `select ... for update` on the singleton row serializes
-- concurrent worker invocations -- see PR #30 spec section 22 -- so two
-- overlapping ticks can never both observe 'initialized'/'rolled_over'
-- for the same transition; the second always sees 'unchanged' once the
-- first commits.
-- ---------------------------------------------------------------------
create or replace function public.advance_notification_baseline(p_week_start date)
returns table (action text, previous_week_start date)
language plpgsql
as $$
declare
  current_row public.notification_baseline_state;
begin
  select * into current_row from public.notification_baseline_state where id = 1 for update;

  if current_row.initialized is not true then
    update public.notification_baseline_state
      set initialized = true,
          current_week_start = p_week_start,
          initialized_at = now(),
          updated_at = now()
      where id = 1;
    return query select 'initialized'::text, null::date;
    return;
  end if;

  if current_row.current_week_start is distinct from p_week_start then
    update public.notification_baseline_state
      set current_week_start = p_week_start,
          rolled_over_at = now(),
          updated_at = now()
      where id = 1;
    return query select 'rolled_over'::text, current_row.current_week_start;
    return;
  end if;

  return query select 'unchanged'::text, current_row.current_week_start;
end;
$$;

revoke all on function public.advance_notification_baseline(date) from public, anon, authenticated;
grant execute on function public.advance_notification_baseline(date) to service_role;

-- ---------------------------------------------------------------------
-- claim_due_pending_notification_changes -- atomically claims debounced
-- changes whose quiet period has elapsed (`status = 'pending' and
-- settle_at <= now()`) using `for update skip locked`, so two concurrent
-- worker ticks can never both settle the same pending change. Rows stuck
-- in 'claimed' for longer than the reclaim window (a previous run that
-- claimed but crashed/timed out before finishing) are first returned to
-- 'pending' so they are never lost. The caller (`changeDetection.ts`) is
-- responsible for turning each claimed row into exactly one
-- notification_jobs row (via dedupe_key = 'settle:' || id, which is
-- idempotent even if the same row is somehow reclaimed twice) and then
-- deleting it.
-- ---------------------------------------------------------------------
create or replace function public.claim_due_pending_notification_changes(p_limit integer default 200)
returns setof public.pending_notification_changes
language plpgsql
as $$
begin
  update public.pending_notification_changes
    set status = 'pending', claimed_at = null
    where status = 'claimed' and claimed_at < now() - interval '10 minutes';

  return query
    update public.pending_notification_changes p
      set status = 'claimed', claimed_at = now()
      where p.id in (
        select id from public.pending_notification_changes
        where status = 'pending' and settle_at <= now()
        order by settle_at
        limit p_limit
        for update skip locked
      )
      returning p.*;
end;
$$;

revoke all on function public.claim_due_pending_notification_changes(integer) from public, anon, authenticated;
grant execute on function public.claim_due_pending_notification_changes(integer) to service_role;

-- ---------------------------------------------------------------------
-- claim_due_notification_jobs -- atomically claims outbox jobs ready to
-- send (`status = 'pending' and scheduled_for <= now() and attempts <
-- max_attempts`) using `for update skip locked`, incrementing `attempts`
-- as part of the claim itself. Jobs stuck in 'claimed' past the reclaim
-- window (a run that claimed but never finished processing) are
-- returned to 'pending' first. The caller
-- (`src/lib/notifications/engine/delivery.ts`) resolves the recipient's
-- active subscriptions, sends via PR #29's `sendPush`, updates
-- notification_deliveries per device, and finally sets the job's own
-- status to 'completed' (every device reached a terminal state, at least
-- one delivered or the recipient had zero active subscriptions --
-- tracked distinctly, see `delivery.ts`), 'failed' (attempts exhausted
-- with no successful delivery), or leaves it 'pending' again for the
-- next tick to retry any devices still transiently failing.
-- ---------------------------------------------------------------------
create or replace function public.claim_due_notification_jobs(p_limit integer default 200)
returns setof public.notification_jobs
language plpgsql
as $$
begin
  update public.notification_jobs
    set status = 'pending'
    where status = 'claimed' and claimed_at < now() - interval '4 minutes';

  return query
    update public.notification_jobs j
      set status = 'claimed', claimed_at = now(), attempts = attempts + 1
      where j.id in (
        select id from public.notification_jobs
        where status = 'pending' and scheduled_for <= now() and attempts < max_attempts
        order by scheduled_for
        limit p_limit
        for update skip locked
      )
      returning j.*;
end;
$$;

revoke all on function public.claim_due_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_due_notification_jobs(integer) to service_role;
