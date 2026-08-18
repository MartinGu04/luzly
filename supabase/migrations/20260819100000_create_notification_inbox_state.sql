-- Notification center: per-user read/dismiss state for the existing
-- notification_jobs outbox (PR #30's durable engine state, unchanged by
-- this migration). The bell's inbox is a THIN projection over
-- notification_jobs -- no second notification-rule engine, no duplicated
-- copy/path computation, and this migration never adds a column to
-- notification_jobs itself. Technical outbox history (status, attempts,
-- claimed_at, etc.) stays entirely worker-owned and is never made
-- user-mutable: "clear inbox" only ever writes to
-- notification_inbox_state below, never notification_jobs.
--
-- SERVICE ROLE, deliberately, same reasoning and same posture as every
-- other notification_* table (see 20260815130000_create_notification_engine.sql's
-- own comment): every read/write here is server-verified (re-resolves
-- `getAuthenticatedIdentity()` first, exactly like
-- `lib/readModels/recentDashboardChanges.ts` already does for reading
-- notification_jobs) and goes through
-- `lib/notifications/engine/store.ts` (the same file, and the same
-- `getNotificationServiceClient()` call site, every other engine table
-- already uses) -- never a second privileged call site, never a
-- client-supplied user id. RLS is enabled with ZERO policies here too:
-- even if the service-role gate were ever bypassed by mistake, an
-- ordinary authenticated/anon request still sees and can change nothing
-- in these tables directly.

-- ---------------------------------------------------------------------
-- notification_reads -- one row per (user, job) the user has marked
-- read. Deliberately per-job, not a single "last read at" cursor: the
-- inbox lets a user mark ONE item read without marking everything before
-- it, so a coarse cursor can't represent that state.
-- ---------------------------------------------------------------------
create table if not exists public.notification_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.notification_jobs (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

comment on table public.notification_reads is
  'Per-user read state for one notification_jobs row (notification center). Never mutates notification_jobs itself.';

create index if not exists notification_reads_user_idx
  on public.notification_reads (user_id);

alter table public.notification_reads enable row level security;

-- ---------------------------------------------------------------------
-- notification_inbox_state -- one singleton row per user. "נקה התראות"
-- (clear inbox) sets `cleared_before` to the current instant; the inbox
-- read model then only shows notification_jobs rows with
-- `scheduled_for > cleared_before`. A single cutoff timestamp rather
-- than a per-job "dismissed" flag: idempotent by construction (clearing
-- again just advances the same cutoff, never errors, never needs a
-- bulk-delete/upsert over every currently-visible job), O(1) storage per
-- user, and -- the important invariant -- structurally incapable of
-- deleting or altering a single notification_jobs row, since it never
-- references one.
-- ---------------------------------------------------------------------
create table if not exists public.notification_inbox_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cleared_before timestamptz not null default '-infinity',
  updated_at timestamptz not null default now()
);

comment on table public.notification_inbox_state is
  'One row per user: the "נקה התראות" cutoff instant. Never touches notification_jobs.';

alter table public.notification_inbox_state enable row level security;
